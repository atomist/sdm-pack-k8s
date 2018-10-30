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
import * as stringify from "json-stringify-safe";
import * as k8 from "kubernetes-client";
import {
    endpointBaseUrl,
    getKubeConfig,
    KubeApplication,
    KubeApplicationRequest,
    upsertApplication,
} from "../support/api";
import { KubeDeployRequestedSdmGoal } from "../typings/types";

export interface CommitForSdmGoal {
    image?: {
        imageName?: string;
    };
}

@Parameters()
export class KubeDeployParameters {
    @Value("environment")
    public environment: string;

    /** cluster or namespace mode, default is cluster */
    @Value({
        path: "kubernetes.mode",
        required: false,
    })
    public mode: "cluster" | "namespace" = "cluster";

    @Value({
        path: "kubernetes.namespaces",
        required: false,
    })
    public namespaces: string[];
}

export const KubeDeploy: OnEvent<KubeDeployRequestedSdmGoal.Subscription, KubeDeployParameters> = async (
    ef: EventFired<KubeDeployRequestedSdmGoal.Subscription>,
    ctx: HandlerContext,
    params: KubeDeployParameters,
): Promise<HandlerResult> => {

    if (!ef.data.SdmGoal) {
        logger.warn(`Received event had no SdmGoal`);
        return Promise.resolve(Success);
    }

    return Promise.all(ef.data.SdmGoal.map(g => {
        const sdmGoal = g as SdmGoalEvent;
        return fetchCommitForSdmGoal(ctx, sdmGoal)
            .then((commit: CommitForSdmGoal) => {
                const eligible = eligibleDeployGoal(sdmGoal, commit);
                if (eligible !== Success) {
                    logger.info(`SDM goal is not eligible for Kubernetes deploy: ${eligible.message}`);
                    return Success;
                }

                const repo = g.repo.name;
                const owner = g.repo.owner;
                const sha = g.sha;
                const workspaceId = ctx.workspaceId;
                const env = params.environment;
                const depName = `${workspaceId}:${env}:${owner}:${repo}:${sha}`;
                if (!commit.image) {
                    const msg = `Kubernetes deploy requested for ${depName} but that commit ` +
                        `has no Docker image associated with it`;
                    return failGoal(ctx, sdmGoal, msg);
                }
                const image = commit.image.imageName;
                logger.debug(`Processing ${depName}`);

                let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
                try {
                    k8Config = getKubeConfig();
                } catch (e) {
                    return failGoal(ctx, sdmGoal, e.message);
                }

                let kubeApp: KubeApplication;
                try {
                    kubeApp = validateSdmGoal(sdmGoal, params);
                } catch (e) {
                    const msg = `${depName} ${e.message}`;
                    return failGoal(ctx, sdmGoal, msg);
                }
                if (!kubeApp) {
                    return Success;
                }

                logger.info(`Deploying ${depName} to Kubernetes`);
                const upsertReq: KubeApplicationRequest = {
                    ...kubeApp,
                    config: k8Config,
                    workspaceId,
                    image,
                };
                return upsertApplication(upsertReq)
                    .then(() => {
                        logger.info(`Successfully deployed ${depName} to Kubernetes`);
                        const upParams: UpdateSdmGoalParams = {
                            state: SdmGoalState.success,
                            description: `Deployed to Kubernetes namespace \`${kubeApp.ns}\``,
                        };
                        if (kubeApp.path && kubeApp.host) {
                            upParams.externalUrls = [{ label: "Endpoint", url: endpointBaseUrl(kubeApp) }];
                        }
                        return updateGoal(ctx, sdmGoal, upParams)
                            .then(() => Success, err => {
                                const message = `Successfully deployed ${depName} to Kubernetes, but failed to ` +
                                    `update the SDM goal: ${err.message}`;
                                logger.error(message);
                                return { code: 1, message };
                            });
                    }, e => {
                        const msg = `Failed to deploy ${depName} to Kubernetes: ${e.message}`;
                        return failGoal(ctx, sdmGoal, msg);
                    });
            });
    }))
        .then(results => reduceResults(results));
};

export const kubeDeploy: EventHandlerRegistration<KubeDeployRequestedSdmGoal.Subscription, KubeDeployParameters> = {
    name: "KubeDeploy",
    description: "Deploy application resources to Kubernetes cluster",
    tags: ["deploy", "kubernetes"],
    subscription: GraphQL.subscription("KubeDeployRequestedSdmGoal"),
    paramsMaker: KubeDeployParameters,
    listener: KubeDeploy,
};

/**
 * Determine if SDM goal event should trigger a deployment to
 * Kubernetes.
 *
 * @param g SDM goal event
 * @return Success if eligible, Failure if not, with message properly populated
 */
export function eligibleDeployGoal(goal: SdmGoalEvent, commit: CommitForSdmGoal): HandlerResult {
    if (!goal.fulfillment) {
        return { code: 1, message: `SDM goal contains no fulfillment: ${stringify(goal)}` };
    }
    const atmName = "@atomist/k8-automation";
    if (goal.fulfillment.name !== atmName) {
        return { code: 1, message: `SDM goal fulfillment name '${goal.fulfillment.name}' is not '${atmName}'` };
    }
    const atmMethod = "side-effect";
    if (goal.fulfillment.method !== atmMethod) {
        return { code: 1, message: `SDM goal fulfillment method '${goal.fulfillment.method}' is not '${atmMethod}'` };
    }
    if (goal.state !== "requested") {
        return { code: 1, message: `SDM goal state '${goal.state}' is not 'requested'` };
    }
    return Success;
}

/* tslint:disable:cyclomatic-complexity */
/**
 * Validate the SDM goal has all necessary data.  It will throw an
 * Error if the goal is invalid in some way.  It will return undefined
 * if nothing should be deployed.
 *
 * @param sdmGoal SDM goal for Kubernetes application deployment
 * @return valid KubeApplication if something should be deployed,
 *         undefined if nothing should be deployed
 */
export function validateSdmGoal(sdmGoal: SdmGoalEvent, kd: KubeDeployParameters): KubeApplication {
    if (!sdmGoal.data) {
        throw new Error(`SDM goal data property is false, cannot deploy: '${stringify(sdmGoal)}'`);
    }
    let sdmData: any;
    try {
        sdmData = JSON.parse(sdmGoal.data);
    } catch (e) {
        e.message = `Failed to parse SDM goal data '${sdmGoal.data}' as JSON: ${e.message}`;
        throw e;
    }
    if (!sdmData.kubernetes) {
        throw new Error(`SDM goal data kubernetes property is false, cannot deploy: '${stringify(sdmData)}'`);
    }
    const kubeApp: KubeApplication = sdmData.kubernetes;
    if (!kubeApp.name) {
        throw new Error(`SDM goal data kubernetes name property is false, cannot deploy: '${stringify(sdmData)}'`);
    }
    if (kubeApp.environment !== kd.environment) {
        logger.info(`SDM goal data kubernetes environment '${kubeApp.environment}' is not this ` +
            `environment '${kd.environment}'`);
        return undefined;
    }
    kubeApp.ns = kubeApp.ns || "default";
    const podNs = process.env.POD_NAMESPACE;
    if (kd.mode === "namespace") {
        if (!podNs) {
            throw new Error(`Kubernetes deploy requested but k8-automation is running in ` +
                `namespace-scoped mode and the POD_NAMESPACE environment variable is not set`);
        }
        if (kubeApp.ns !== podNs) {
            logger.info(`SDM goal data kubernetes namespace '${kubeApp.ns}' is not the name as ` +
                `k8-automation running in namespace-scoped mode '${podNs}'`);
            return undefined;
        }
    } else if (kd.namespaces && kd.namespaces.length > 0 && !kd.namespaces.includes(kubeApp.ns)) {
        logger.info(`SDM goal data kubernetes namespace '${kubeApp.ns}' is not in managed ` +
            `namespaces '${kd.namespaces.join(",")}'`);
        return undefined;
    }
    return kubeApp;
}
/* tslint:enable:cyclomatic-complexity */

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
