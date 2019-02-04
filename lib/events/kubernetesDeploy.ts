/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    EventFired,
    GraphQL,
    HandlerContext,
    HandlerResult,
    logger,
    OnEvent,
    Parameters,
    reduceResults,
    Success,
    Value,
} from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    ExecuteGoalResult,
    LoggingProgressLog,
    ProgressLog,
    SdmGoalEvent,
    SdmGoalState,
    SoftwareDeliveryMachineConfiguration,
    updateGoal,
    UpdateSdmGoalParams,
    WriteToAllProgressLog,
} from "@atomist/sdm";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { getKubernetesGoalEventData } from "../deploy/data";
import {
    deployAppId,
    deployApplication,
    llog,
} from "../deploy/deploy";
import { KubernetesApplication } from "../kubernetes/request";
import { KubernetesDeployRequestedSdmGoal } from "../typings/types";

/**
 * Parameters for the deploying an application to a Kubernetes cluster
 * via an event subscription.
 */
@Parameters()
export class KubernetesDeployParameters {
    /**
     * Make the entire SDM configuration available to this event
     * handler.  The specific properties used are:
     *
     * `name`: Name of this SDM.  Only requested SDM Kubernetes
     * deployment goals whose fulfillment name match this name are
     * deployed by this SDM.
     *
     * `sdm.logFactory`: Used to generate a log sink to send progress
     * logs to.
     */
    @Value("") // empty path returns the entire configuration
    public configuration: SoftwareDeliveryMachineConfiguration;
}

/**
 * Event handler for deploying an application to a Kubernetes cluster.
 * The definition of the application to be deployed is handled by the
 * [[KubernetesDeploy]] goal of this or another SDM.  This SDM will
 * execute deployments configured for it, see [[eligibleDeployGoal]]
 * and [[verifyKubernetesApplicationDeploy]] for details.
 */
export const HandleKubernetesDeploy: OnEvent<KubernetesDeployRequestedSdmGoal.Subscription, KubernetesDeployParameters> = async (
    ef: EventFired<KubernetesDeployRequestedSdmGoal.Subscription>,
    context: HandlerContext,
    params: KubernetesDeployParameters,
): Promise<HandlerResult> => {

    if (!ef || !ef.data || !ef.data.SdmGoal) {
        logger.warn(`Received event had no SdmGoal`);
        return Success;
    }

    return Promise.all(ef.data.SdmGoal.map(async g => {
        const goalEvent = g as SdmGoalEvent;

        const progressLog = new WriteToAllProgressLog(goalEvent.name, new LoggingProgressLog(goalEvent.name, "debug"),
            await params.configuration.sdm.logFactory(context, goalEvent));

        const eligible = await eligibleDeployGoal(goalEvent, params);
        if (!eligible) {
            llog("SDM goal event is not eligible for Kubernetes deploy", logger.info, progressLog);
            return Success;
        }

        let app: KubernetesApplication;
        try {
            app = getKubernetesGoalEventData(goalEvent);
        } catch (e) {
            e.message = `Invalid SDM goal event data: ${e.message}`;
            llog(e.message, logger.error, progressLog);
            throw e;
        }
        if (!app) {
            llog("SDM goal event has no Kubernetes application data", logger.info, progressLog);
            return Success;
        }
        const appId = deployAppId(goalEvent, context, app);

        try {
            const result = await deployApplication(goalEvent, context);

            const updateParams: UpdateSdmGoalParams = {
                state: (result.code) ? SdmGoalState.failure : SdmGoalState.success,
                description: result.description,
                error: (result.code) ? new Error(result.message) : undefined,
                externalUrls: result.externalUrls,
            };
            try {
                await updateGoal(context, goalEvent, updateParams);
            } catch (e) {
                const msg = `Failed to update SDM goal '${stringify(goalEvent)}' with params ` +
                    `'${stringify(updateParams)}': ${e.message}`;
                llog(msg, logger.error, progressLog);
                result.message = `${e.message}; ${msg}`;
            }
            if (!result.code) {
                result.code = 0;
            }
            return result as ExecuteGoalResult & HandlerResult;
        } catch (e) {
            const msg = `Failed to deploy ${appId}: ${e.message}`;
            return failGoal(context, goalEvent, msg, progressLog);
        }
    }))
        .then(reduceResults);
};

/**
 * Create an event handler registration for this SDM to deploy
 * requested Kubernetes applications.
 */
export function kubernetesDeployHandler(self: string)
    : EventHandlerRegistration<KubernetesDeployRequestedSdmGoal.Subscription, KubernetesDeployParameters> {
    return {
        name: "KubernetesDeploy",
        description: "Deploy application resources to Kubernetes cluster",
        tags: ["deploy", "kubernetes"],
        subscription: GraphQL.subscription({ name: "KubernetesDeployRequestedSdmGoal", variables: { fulfillmentName: self } }),
        paramsMaker: KubernetesDeployParameters,
        listener: HandleKubernetesDeploy,
    };
}

/**
 * Determine if SDM goal event should trigger a deployment to
 * Kubernetes.  Specifically, is the name of the goal fulfillment
 * equal to the name of this SDM and is the goal in the "in_process"
 * state.  Since we have improved the subscription to select for all
 * of these values, these checks should no longer be necessary.
 *
 * @param goalEvent SDM goal event
 * @param params information about this SDM
 * @return `true` if goal is eligible, `false` otherwise
 */
export async function eligibleDeployGoal(goalEvent: SdmGoalEvent, params: KubernetesDeployParameters): Promise<boolean> {
    if (!goalEvent.fulfillment) {
        logger.debug(`SDM goal contains no fulfillment: ${stringify(goalEvent)}`);
        return false;
    }
    if (goalEvent.state !== SdmGoalState.in_process) {
        logger.debug(`SDM goal state '${goalEvent.state}' is not 'in_process'`);
        return false;
    }
    const name = params.configuration.name;
    if (goalEvent.fulfillment.name !== name) {
        logger.debug(`SDM goal fulfillment name '${goalEvent.fulfillment.name}' is not '${name}'`);
        return false;
    }
    return true;
}

/**
 * Fail the provided goal using the message to set the description and
 * error message.
 *
 * @param context handler context to use to send the update
 * @param goalEvent SDM goal to update
 * @param message informative error message
 * @return a failure handler result using the provided error message
 */
async function failGoal(context: HandlerContext, goalEvent: SdmGoalEvent, message: string, log: ProgressLog): Promise<HandlerResult> {
    llog(message, logger.error, log);
    const params: UpdateSdmGoalParams = {
        state: SdmGoalState.failure,
        description: message,
        error: new Error(message),
    };
    try {
        await updateGoal(context, goalEvent, params);
    } catch (e) {
        const msg = `Failed to update SDM goal '${stringify(goalEvent)}' with params '${stringify(params)}': ${e.message}`;
        llog(msg, logger.error, log);
        return { code: 2, message: `${message}; ${msg}` };
    }
    return { code: 1, message };
}
