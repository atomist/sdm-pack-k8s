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
import * as k8 from "kubernetes-client";
import * as path from "path";
import {
    endpointBaseUrl,
    getKubeConfig,
    KubeApplication,
    KubeApplicationRequest,
    upsertApplication,
} from "../support/api";
import {
    validateSdmGoal,
} from "../support/deploy";
import {
    KubernetesApplicationOptions,
} from "../support/options";
import {
    defaultNamespace,
} from "../typings/kubernetes";
import { KubeDeployRequestedSdmGoal } from "../typings/types";

export interface CommitForSdmGoal {
    image?: {
        imageName?: string;
    };
}

@Parameters()
export class KubernetesDeployParameters {
    @Value("environment")
    public environment: string;

    /** cluster or namespace mode, default is cluster */
    @Value({
        path: "sdm.k8.mode",
        required: false,
    })
    public mode: "cluster" | "namespace" = "cluster";

    @Value({
        path: "sdm.k8.namespaces",
        required: false,
    })
    public namespaces: string[];
}

/* tslint:disable:cyclomatic-complexity */
export const KubernetesDeploy: OnEvent<KubeDeployRequestedSdmGoal.Subscription, KubernetesDeployParameters> = async (
    ef: EventFired<KubeDeployRequestedSdmGoal.Subscription>,
    ctx: HandlerContext,
    params: KubernetesDeployParameters,
): Promise<HandlerResult> => {

    if (!ef.data.SdmGoal) {
        logger.warn(`Received event had no SdmGoal`);
        return Promise.resolve(Success);
    }

    return Promise.all(ef.data.SdmGoal.map(async g => {
        const sdmGoal = g as SdmGoalEvent;
        const eligible = await eligibleDeployGoal(sdmGoal);
        if (!eligible) {
            logger.info("SDM goal is not eligible for Kubernetes deploy");
            return Success;
        }
        const repo = g.repo.name;
        const owner = g.repo.owner;
        const sha = g.sha;
        const workspaceId = ctx.workspaceId;
        const env = params.environment;
        const depName = `${workspaceId}:${env}:${owner}:${repo}:${sha}`;
        const commit = await fetchCommitForSdmGoal(ctx, sdmGoal);
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

        let kubeGoalData = validateSdmGoal(sdmGoal);
        if (!kubeGoalData) {
            logger.debug(`No Kubernetes goal data found for ${depName}`);
            return Success;
        }
        try {
            kubeGoalData = verifyKubernetesApplicationDeploy(kubeGoalData, params);
            if (!kubeGoalData) {
                logger.debug(`Kubernetes deployment data did not match parameters for ${depName}`);
                return Success;
            }
        } catch (e) {
            const msg = `${depName} ${e.message}`;
            return failGoal(ctx, sdmGoal, msg);
        }

        const kubeApp: KubeApplication = {
            ...kubeGoalData,
            workspaceId,
            image,
            ns: kubeGoalData.ns || defaultNamespace,
        };

        logger.info(`Deploying ${depName} to Kubernetes`);
        const upsertReq: KubeApplicationRequest = {
            ...kubeApp,
            config: k8Config,
        };
        try {
            await upsertApplication(upsertReq);
        } catch (e) {
            const msg = `Failed to deploy ${depName} to Kubernetes: ${e.message}`;
            return failGoal(ctx, sdmGoal, msg);
        }
        logger.info(`Successfully deployed ${depName} to Kubernetes`);
        const upParams: UpdateSdmGoalParams = {
            state: SdmGoalState.success,
            description: `Deployed to Kubernetes namespace \`${kubeApp.ns}\``,
        };
        if (kubeApp.path && kubeApp.host) {
            const label = `Kubernetes ${env}:${kubeApp.ns}`;
            const url = endpointBaseUrl(kubeApp);
            upParams.externalUrls = [{ label, url }];
        }
        try {
            await updateGoal(ctx, sdmGoal, upParams);
        } catch (e) {
            const msg = `Successfully deployed ${depName} to Kubernetes, but failed to ` +
                `update the SDM goal: ${e.message}`;
            return failGoal(ctx, sdmGoal, msg);
        }
        return Success;
    }))
        .then(reduceResults);
};
/* tslint:enable:cyclomatic-complexity */

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
    const atmMethod = "side-effect";
    if (goal.fulfillment.method !== atmMethod) {
        logger.debug(`SDM goal fulfillment method '${goal.fulfillment.method}' is not '${atmMethod}'`);
        return false;
    }
    if (goal.state !== "requested") {
        logger.debug(`SDM goal state '${goal.state}' is not 'requested'`);
        return false;
    }
    return true;
}

/* tslint:disable:cyclomatic-complexity */
/**
 * Verify that the deployment of the application should be fulfilled
 * by this SDM.  Ensures the that environment and namespace of the
 * application and deployment parameters match, as appropriate.
 *
 * If deployment environment is not set, it is presumed to satisfy all
 * environments so any application environment is considered to match.
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
export function verifyKubernetesApplicationDeploy(
    app: KubernetesApplicationOptions,
    deploy: KubernetesDeployParameters,
): KubernetesApplicationOptions | undefined {

    app.ns = app.ns || defaultNamespace;
    if (!deploy) {
        return app;
    }
    if (deploy.environment && deploy.environment !== app.environment) {
        logger.debug(`SDM goal data kubernetes environment '${app.environment}' is not this ` +
            `environment '${deploy.environment}'`);
        return undefined;
    }
    if (deploy.mode === "namespace") {
        const podNs = process.env.POD_NAMESPACE;
        if (!podNs) {
            throw new Error(`Kubernetes deploy requested but k8-automation is running in ` +
                `namespace-scoped mode and the POD_NAMESPACE environment variable is not set`);
        }
        if (app.ns !== podNs) {
            logger.info(`SDM goal data kubernetes namespace '${app.ns}' is not the name as ` +
                `k8-automation running in namespace-scoped mode '${podNs}'`);
            return undefined;
        }
    } else if (deploy.namespaces && deploy.namespaces.length > 0 && !deploy.namespaces.includes(app.ns)) {
        logger.debug(`SDM goal data kubernetes namespace '${app.ns}' is not in managed ` +
            `namespaces '${deploy.namespaces.join(",")}'`);
        return undefined;
    }

    return app;
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
