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
    HandlerResult,
    logger,
} from "@atomist/automation-client";
import {
    ExecuteGoal,
    ExecuteGoalResult,
    GoalInvocation,
    ProgressLog,
    SdmGoalEvent,
} from "@atomist/sdm";
import stringify = require("json-stringify-safe");
import * as k8 from "kubernetes-client";
import {
    defaultNamespace,
} from "../typings/kubernetes";
import {
    endpointBaseUrl,
    getKubeConfig,
    KubeApplication,
    KubeApplicationRequest,
    upsertApplication,
} from "./api";
import {
    KubernetesGoalData,
} from "./goal";

export interface KubernetesDeployerOptions {
    context: string;
}

export function executeKubernetesDeploy(): ExecuteGoal {
    return async (goalInvocation: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { configuration, context, sdmGoal, progressLog } = goalInvocation;

        const options: KubernetesDeployerOptions = configuration.sdm.k8;
        const repo = sdmGoal.repo.name;
        const owner = sdmGoal.repo.owner;
        const sha = sdmGoal.sha;
        const workspaceId = context.workspaceId;
        const env = configuration.environment;
        const depName = `${workspaceId}:${env}:${owner}:${repo}:${sha}`;
        if (!sdmGoal.push.after.image) {
            const msg = `Kubernetes deploy requested for ${depName} but that commit ` +
                `has no Docker image associated with it`;
            return failDeploy(progressLog, msg);
        }
        const image = sdmGoal.push.after.image.imageName;
        progressLog.write(`Processing ${depName}`);

        let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
        try {
            k8Config = getKubeConfig(options.context);
        } catch (e) {
            return failDeploy(progressLog, `Failed to get kube config for ${depName}: ${e.message}`);
        }

        const kubeGoalData = validateSdmGoal(sdmGoal);
        if (!kubeGoalData) {
            return { code: 1, message: "No Kubernetes goal data found" };
        }

        const kubeApp: KubeApplication = {
            ...kubeGoalData,
            workspaceId,
            image,
            ns: kubeGoalData.ns || defaultNamespace,
        };

        progressLog.write(`Deploying ${depName} to Kubernetes`);
        const upsertReq: KubeApplicationRequest = {
            ...kubeApp,
            config: k8Config,
        };
        try {
            await upsertApplication(upsertReq);
        } catch (e) {
            return failDeploy(progressLog, `Failed to deploy ${depName} to Kubernetes: ${e.message}`);
        }
        const message = `Successfully deployed ${depName} to Kubernetes`;
        progressLog.write(message);
        const description = `Deployed to Kubernetes namespace \`${kubeApp.ns}\``;
        const label = `Kubernetes ${env}:${kubeApp.ns}`;
        const targetUrls = (kubeApp.path && kubeApp.host) ? [{ label, url: endpointBaseUrl(kubeApp) }] : undefined;
        return { code: 0, message, description, targetUrls };
    };
}

/**
 * Validate the SDM goal has all necessary data.  It will return the
 * KubeApplication data if the deployment should proceed.  It will ll
 * return undefined if nothing should be deployed.
 *
 * @param sdmGoal SDM goal for Kubernetes application deployment
 * @return valid KubeApplication if something should be deployed,
 *         undefined if nothing should be deployed
 */
export function validateSdmGoal(sdmGoal: SdmGoalEvent): KubernetesGoalData | undefined {
    if (!sdmGoal.data) {
        logger.debug(`SDM goal data property is false, cannot deploy: '${stringify(sdmGoal)}'`);
        return undefined;
    }
    let sdmData: any;
    try {
        sdmData = JSON.parse(sdmGoal.data);
    } catch (e) {
        logger.debug(`Failed to parse SDM goal data '${sdmGoal.data}' as JSON: ${e.message}`);
        return undefined;
    }
    if (!sdmData.kubernetes) {
        logger.debug(`SDM goal data kubernetes property is false, cannot deploy: '${stringify(sdmData)}'`);
        return undefined;
    }
    const kubeApp: KubernetesGoalData = sdmData.kubernetes;
    if (!kubeApp.name) {
        logger.debug(`SDM goal data kubernetes name property is false, cannot deploy: '${stringify(sdmData)}'`);
        return undefined;
    }
    return kubeApp;
}

/**
 * Report and return failure.
 *
 * @param message informative error message
 * @return a failure handler result using the provided error message
 */
function failDeploy(log: ProgressLog, message: string): HandlerResult {
    log.write(message);
    logger.error(message);
    return { code: 1, message };
}
