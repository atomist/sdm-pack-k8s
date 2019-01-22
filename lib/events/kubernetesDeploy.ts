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
    SdmGoalEvent,
    SdmGoalState,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import * as stringify from "json-stringify-safe";
import { getKubernetesGoalEventData } from "../deploy/data";
import {
    deployAppId,
    deployApplication,
} from "../deploy/deploy";
import { KubernetesApplication } from "../kubernetes/request";
import { KubernetesDeployRequestedSdmGoal } from "../typings/types";

/**
 * Parameters for the side-effect fulfillment of the Kubernetes
 * deployment via an event subscription.
 */
@Parameters()
export class KubernetesDeployParameters {
    /**
     * Environment to deploy applications to.  Only requested SDM
     * Kubernetes deployment goals whose Kubernetes application
     * environment match this environment are deployed by this SDM.
     */
    @Value("environment")
    public environment: string;

    /**
     * Name of this SDM.  Only requested SDM Kubernetes deployment
     * goals whose side-effect fulfillment name match this name are
     * deployed by this SDM.
     */
    @Value("name")
    public name: string;

    /**
     * The namespaces to manage application deploys.  If falsey, all
     * namespaces are managed.
     */
    @Value({
        path: "sdm.k8s.namespaces",
        required: false,
    })
    public namespaces?: string[];
}

/**
 * Event handler for side-effect fulfillment mode, allowing this SDM
 * to execute Kubernetes deployments requested by another SDM.
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
        const eligible = await eligibleDeployGoal(goalEvent, params);
        if (!eligible) {
            logger.info("SDM goal event is not eligible for Kubernetes deploy");
            return Success;
        }

        let app: KubernetesApplication;
        try {
            app = getKubernetesGoalEventData(goalEvent);
        } catch (e) {
            e.message = `Invalid SDM goal event data: ${e.message}`;
            throw e;
        }
        if (!app) {
            logger.info("SDM goal event has no Kubernetes application data");
            return Success;
        }
        const appId = deployAppId(goalEvent, context, app);

        if (!verifyKubernetesApplicationDeploy(app, params)) {
            logger.debug(`Kubernetes application data did not match parameters for ${appId}`);
            return Success;
        }

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
                logger.error(msg);
                result.message = `${e.message}; ${msg}`;
            }
            if (!result.code) {
                result.code = 0;
            }
            return result as ExecuteGoalResult & HandlerResult;
        } catch (e) {
            const msg = `Failed to deploy ${appId}: ${e.message}`;
            return failGoal(context, goalEvent, msg);
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
 * Kubernetes.  Since we have improved the subscription to select for
 * all of these values, these checks should no longer be necessary.
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
        logger.debug(`SDM goal state '${goalEvent.state}' is not 'requested'`);
        return false;
    }
    if (goalEvent.fulfillment.name !== params.name) {
        logger.debug(`SDM goal fulfillment name '${goalEvent.fulfillment.name}' is not '${params.name}'`);
        return false;
    }
    return true;
}

/**
 * Verify if this Kubernetes application should be deployed by this
 * SDM.  Namely,
 *
 * 1.  It ensures the environment of the application and this SDM are
 *     the same.
 * 2.  If the SDM k8s options defines namespaces to manage, the
 *     application namespace (ns) must be in that list of namespaces.
 *
 * If the deployment mode is "namespace", then the `POD_NAMESPACE`
 * environment variable must be defined.  If the values of `app.ns`
 * and `POD_NAMESPACE` environment variable are the same, it is a
 * match.  If they are not equal, `undefined` will be returned.  If
 * `POD_NAMESPACE` is not set, an `Error` is thrown.
 *
 * If the deployment mode is "cluster" or not set and the deployment
 * namespaces array has elements, then then the value of `app.ns` must
 * be in the array for there to be a match.  If the deployment
 * namespaces array is not set or zero length, any value of `app.ns`
 * is considered a match.
 *
 * @param app Kubernetes application options data from SDM goal.
 * @param deploy Kubernetes deployment parameters from command or configuration.
 * @return verified Kubernetes application options if deployment should proceed, `undefined` otherwise.
 */
export function verifyKubernetesApplicationDeploy(app: KubernetesApplication, params: KubernetesDeployParameters): boolean {
    if (app.environment !== params.environment) {
        logger.debug(`Kubernetes application environment '${app.environment}' is not SDM environment '${params.environment}'`);
        return false;
    }
    if (params.namespaces && !params.namespaces.includes(app.ns)) {
        logger.debug(`Kubernetes application namespace '${app.ns}' is not in managed namespaces '${params.namespaces.join(",")}'`);
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
async function failGoal(context: HandlerContext, goalEvent: SdmGoalEvent, message: string): Promise<HandlerResult> {
    logger.error(message);
    const params: UpdateSdmGoalParams = {
        state: SdmGoalState.failure,
        description: message,
        error: new Error(message),
    };
    try {
        await updateGoal(context, goalEvent, params);
    } catch (e) {
        const msg = `Failed to update SDM goal '${stringify(goalEvent)}' with params '${stringify(params)}': ${e.message}`;
        logger.error(msg);
        return { code: 2, message: `${message}; ${msg}` };
    }
    return { code: 1, message };
}
