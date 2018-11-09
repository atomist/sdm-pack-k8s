/*
 * Copyright © 2018 Atomist, Inc.
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
    fetchCommitForSdmGoal,
    SdmGoalEvent,
    SdmGoalState,
    updateGoal,
    UpdateSdmGoalParams,
} from "@atomist/sdm";
import * as appRoot from "app-root-path";
import * as fs from "fs-extra";
import * as stringify from "json-stringify-safe";
import * as path from "path";
import {
    deployApplication,
    KubernetesDeployCoreOptions,
    KubernetesDeployMode,
} from "../support/deploy";
import { KubeDeployRequestedSdmGoal } from "../typings/types";

/**
 * Parameters for the side-effect fulfillment of the Kubernetes
 * deployment via an event subscription.
 */
@Parameters()
export class KubernetesDeployParameters implements KubernetesDeployCoreOptions {
    @Value("environment")
    public environment: string;

    /** cluster or namespace mode, default is cluster */
    @Value({
        path: "sdm.k8.mode",
        required: false,
    })
    public mode: KubernetesDeployMode = KubernetesDeployMode.Cluster;

    @Value({
        path: "sdm.k8.namespaces",
        required: false,
    })
    public namespaces: string[];
}

/**
 * Event handler for side-effect fulfillment mode, allowing this SDM
 * to execute Kubernetes deployments requested by another SDM.
 */
export const KubernetesDeploy: OnEvent<KubeDeployRequestedSdmGoal.Subscription, KubernetesDeployParameters> = async (
    ef: EventFired<KubeDeployRequestedSdmGoal.Subscription>,
    ctx: HandlerContext,
    params: KubernetesDeployParameters,
): Promise<HandlerResult> => {

    if (!ef.data.SdmGoal) {
        logger.warn(`Received event had no SdmGoal`);
        return Promise.resolve(Success);
    }

    if (params.mode !== KubernetesDeployMode.Cluster && params.mode !== KubernetesDeployMode.Namespace) {
        throw new Error(`Invalid Kubernetes deployment mode, neither "cluster" nor "namespace": ${params.mode}`);
    }

    return Promise.all(ef.data.SdmGoal.map(async g => {
        const sdmGoal = g as SdmGoalEvent;
        const eligible = await eligibleDeployGoal(sdmGoal);
        if (!eligible) {
            logger.info("SDM goal is not eligible for Kubernetes deploy");
            return Success;
        }
        const commit = await fetchCommitForSdmGoal(ctx, sdmGoal);
        if (!commit.images || commit.images.length < 1) {
            const msg = `Kubernetes deploy requested but that commit has no Docker image: ${stringify(commit)}`;
            return failGoal(ctx, sdmGoal, msg);
        }
        const image = commit.images[0].imageName;

        try {
            const result = await deployApplication(sdmGoal, ctx, { ...params, image });

            const updateParams: UpdateSdmGoalParams = {
                state: (result.code) ? SdmGoalState.failure : SdmGoalState.success,
                description: result.description,
                error: (result.code) ? new Error(result.message) : undefined,
                externalUrls: result.targetUrls,
            };
            try {
                await updateGoal(ctx, sdmGoal, updateParams);
            } catch (e) {
                const msg = `Failed to update SDM goal '${stringify(sdmGoal)}' with params ` +
                    `'${stringify(updateParams)}': ${e.message}`;
                logger.error(msg);
                result.message = `${e.message}; ${msg}`;
            }
            return result;
        } catch (e) {
            const msg = `Deploy failed: ${e.message}`;
            return failGoal(ctx, sdmGoal, msg);
        }
    }))
        .then(reduceResults);
};

export const kubernetesDeploy: EventHandlerRegistration<KubeDeployRequestedSdmGoal.Subscription,
    KubernetesDeployParameters> = {
    name: "KubeDeploy",
    description: "Deploy application resources to Kubernetes cluster",
    tags: ["deploy", "kubernetes"],
    subscription: GraphQL.subscription("KubeDeployRequestedSdmGoal"),
    paramsMaker: KubernetesDeployParameters,
    listener: KubernetesDeploy,
};

/**
 * Determine if SDM goal event should trigger a deployment to
 * Kubernetes.
 *
 * @param g SDM goal event
 * @return Success if eligible, Failure if not, with message properly populated
 */
export async function eligibleDeployGoal(goal: SdmGoalEvent): Promise<boolean> {
    if (!goal.fulfillment) {
        logger.debug(`SDM goal contains no fulfillment: ${stringify(goal)}`);
        return false;
    }
    const atmMethod = "side-effect";
    if (goal.fulfillment.method !== atmMethod) {
        logger.debug(`SDM goal fulfillment method '${goal.fulfillment.method}' is not '${atmMethod}'`);
        return false;
    }
    if (goal.state !== "requested") {
        logger.debug(`SDM goal state '${goal.state}' is not 'requested'`);
        return false;
    }
    const pkgPath = path.join(appRoot.path, "package.json");
    try {
        const pkg: { name: string } = await fs.readJson(pkgPath);
        if (goal.fulfillment.name !== pkg.name) {
            logger.debug(`SDM goal fulfillment name '${goal.fulfillment.name}' is not '${pkg.name}'`);
            return false;
        }
    } catch (e) {
        logger.warn(`Failed to determine package name: ${e.message}`);
        return false;
    }
    return true;
}

/**
 * Fail the provided goal using the message to set the description and
 * error message.
 *
 * @param ctx handler context to use to send the update
 * @param goal SDM goal to update
 * @param message informative error message
 * @return a failure handler result using the provided error message
 */
function failGoal(ctx: HandlerContext, goal: SdmGoalEvent, message: string): Promise<HandlerResult> {
    logger.error(message);
    const params: UpdateSdmGoalParams = {
        state: SdmGoalState.failure,
        description: message,
        error: new Error(message),
    };
    return updateGoal(ctx, goal, params)
        .then(() => ({ code: 1, message }), err => {
            const msg = `Failed to update SDM goal '${stringify(goal)}' with params ` +
                `'${stringify(params)}': ${err.message}`;
            logger.error(msg);
            return { code: 2, message: `${message}; ${msg}` };
        });
}
