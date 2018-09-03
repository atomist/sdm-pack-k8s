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

import { logger } from "@atomist/automation-client";
import {
    ExecuteGoal,
    ExecuteGoalResult,
    GoalInvocation,
    SdmGoalEvent,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import stringify = require("json-stringify-safe");
import * as k8 from "kubernetes-client";
import {
    endpointBaseUrl,
    getKubeConfig,
    KubeApplication,
    KubeApplicationRequest,
    upsertApplication,
} from "./api";

export interface KubernetesDeployerOptions {
    environment: string;
    mode: "cluster" | "namespace";
    namespaces: string[];
}

export function executeKubernetesDeploy(options: KubernetesDeployerOptions): ExecuteGoal {
    return async (goalInvocation: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { context, sdmGoal, progressLog } = goalInvocation;

        const repo = sdmGoal.repo.name;
        const owner = sdmGoal.repo.owner;
        const sha = sdmGoal.sha;
        const workspaceId = context.workspaceId;
        const env = options.environment;
        const depName = `${workspaceId}:${env}:${owner}:${repo}:${sha}`;
        if (!sdmGoal.push.after.image) {
            const msg = `Kubernetes deploy requested for ${depName} but that commit ` +
                `has no Docker image associated with it`;
            return { code: 1, message: msg };
        }
        const image = sdmGoal.push.after.image.imageName;
        progressLog.write(`Processing ${depName}`);

        let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
        try {
            k8Config = getKubeConfig();
        } catch (e) {
            return { code: 1, message: e.message };
        }

        let kubeApp: KubeApplication;
        try {
            kubeApp = validateSdmGoal(sdmGoal, options);
        } catch (e) {
            const msg = `${depName} ${e.message}`;
            return { code: 1, message: msg };
        }
        if (!kubeApp) {
            return { code: 1, message: "No Kuberneetes deployment data found"};
        }

        progressLog.write(`Deploying ${depName} to Kubernetes`);
        const upsertReq: KubeApplicationRequest = {
            ...kubeApp,
            config: k8Config,
            workspaceId,
            image,
        };
        return upsertApplication(upsertReq)
            .then(() => {
                const message = `Successfully deployed ${depName} to Kubernetes`;
                const description = `Deployed to Kubernetes namespace \`${kubeApp.ns}\``;
                progressLog.write(message);
                if (kubeApp.path && kubeApp.host) {
                    return { code: 0, message, targetUrl: endpointBaseUrl(kubeApp), description };
                } else {
                    return { code: 0, message, description };
                }
            }, e => {
                const msg = `Failed to deploy ${depName} to Kubernetes: ${e.message}`;
                progressLog.write(msg);
                return { code: 1, message: msg };
            });
    };
}

/**
 * Validate the SDM goal has all necessary data.  It will throw an
 * Error if the goal is invalid in some way.  It will return undefined
 * if nothing should be deployed.
 *
 * @param sdmGoal SDM goal for Kubernetes application deployment
 * @return valid KubeApplication if something should be deployed,
 *         undefined if nothing should be deployed
 */
export function validateSdmGoal(sdmGoal: SdmGoalEvent, kd: KubernetesDeployerOptions): KubeApplication {
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
    if (!isInLocalMode()) {
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
    }
    return kubeApp;
}
