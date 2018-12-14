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
    HandlerContext,
    HandlerResult,
    LeveledLogMethod,
    logger,
    Success,
} from "@atomist/automation-client";
import {
    ExecuteGoal,
    ExecuteGoalResult,
    GoalInvocation,
    ProgressLog,
    SdmGoalEvent,
} from "@atomist/sdm";
import * as stringify from "json-stringify-safe";
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
import {
    KubernetesApplicationOptions,
} from "./options";

/**
 * When in side-effect fulfillment mode, the SDM can operate in either
 * a cluster-wide mode or a namespace-scoped mode.
 */
export enum KubernetesDeployMode {
    /**
     * Cluster-wide mode where the SDM manages deployments in multiple
     * namespaces.  See [[KubernetesDeployCoreoptions.namespaces]] for
     * information on how to control which namespaces are managed.
     */
    Cluster = "cluster",
    /**
     * Namespace-scoped mode where the SDM only manages deployments to
     * the namespace in which it is running.
     */
    Namespace = "namespace",
}

/**
 * Interface to tie the [[KubeDeploymentParameters]] to the
 * [[KubernetesDeployOptions]].
 */
export interface KubernetesDeployCoreOptions {
    /**
     * Environment in which this SDM is running.  For a side-effect
     * fulfillment, if its environment is not the same as that
     * specified in the goal, the goal is not executed.
     */
    environment: string;
    /**
     * This must and should only be specified when an SDM is operating
     * in side-effect fulfillment mode.  See [[KubernetesDeployMode]].
     */
    mode?: KubernetesDeployMode;
    /**
     * The namespaces to manage when an SDM is running in side-effect
     * filfillment cluster-mode.  If it is `undefined` or an empty
     * array, all namespaces are managed.
     */
    namespaces?: string[];
}

/**
 * Options available when deploying a Kubernetes application.  Most of
 * the necessary information comes from the goal itself.
 */
export interface KubernetesDeployOptions extends KubernetesDeployCoreOptions {
    /** Full registry, name, and tag of Docker image to deploy. */
    image: string;
    /** Kubernetes config context to use when running in local mode. */
    context?: string;
}

/**
 * Log to a specific log level method and optionally a progress log.
 *
 * @param ll Levelled log method like `logger.debug()`
 * @param log goal progress log
 */
function llog(message: string, ll: LeveledLogMethod, log?: ProgressLog): void {
    if (log) {
        log.write(message);
    }
    ll(message);
}

/**
 * Execute a Kubernetes deployment within the context of an SDM goal.
 * This function is able to be called for internal or side-effect goal
 * fulfillments.
 *
 * @param sdmGoal The Kubernetes deployment goal
 * @param context A standard handler context available from goal executions
 *                or event handlers
 * @param options Kubernetes deployment options
 * @param log     SDM goal progress log
 * @return goal success or failure, with endpoint URL(s) on success if
 *         ingress properties are set
 */
export async function deployApplication(
    sdmGoal: SdmGoalEvent,
    context: HandlerContext,
    options: KubernetesDeployOptions,
    log?: ProgressLog,
): Promise<ExecuteGoalResult> {

    const repo = sdmGoal.repo.name;
    const owner = sdmGoal.repo.owner;
    const sha = sdmGoal.sha;
    const workspaceId = context.workspaceId;
    const env = options.environment;
    const appName = `${workspaceId}:${env}:${owner}:${repo}:${sha}`;
    llog(`Processing ${appName}`, logger.debug, log);

    let kubeGoalData = validateSdmGoal(sdmGoal);
    if (!kubeGoalData) {
        if (options.mode) {
            logger.debug(`No Kubernetes goal data found for ${appName}`);
            return Success;
        }
        return logAndFailDeploy(`No Kubernetes goal data found for ${appName}`, log);
    }
    try {
        kubeGoalData = verifyKubernetesApplicationDeploy(kubeGoalData, options);
        if (!kubeGoalData) {
            logger.debug(`Kubernetes deployment data did not match parameters for ${appName}`);
            return Success;
        }
    } catch (e) {
        const msg = `${appName} ${e.message}`;
        return logAndFailDeploy(msg, log);
    }

    const kubeApp: KubeApplication = {
        ...kubeGoalData,
        workspaceId,
        image: options.image,
        ns: kubeGoalData.ns || defaultNamespace,
    };

    let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
    try {
        k8Config = getKubeConfig(options.context);
    } catch (e) {
        return logAndFailDeploy(`Failed to get kube config for ${appName}: ${e.message}`, log);
    }

    llog(`Deploying ${appName} to Kubernetes`, logger.info, log);
    const upsertReq: KubeApplicationRequest = {
        ...kubeApp,
        config: k8Config,
    };
    try {
        await upsertApplication(upsertReq);
    } catch (e) {
        return logAndFailDeploy(`Failed to deploy ${appName} to Kubernetes: ${e.message}`, log);
    }
    const message = `Successfully deployed ${appName} to Kubernetes`;
    llog(message, logger.info, log);
    const description = `Deployed to Kubernetes namespace \`${kubeApp.ns}\``;
    const label = `Kubernetes ${env}:${kubeApp.ns}`;
    const externalUrls = (kubeApp.path && kubeApp.host) ? [{ label, url: endpointBaseUrl(kubeApp) }] : undefined;
    return { code: 0, message, description, externalUrls };
}

/**
 * Goal executor wrapper for deploying an application to Kubernetes.
 */
export function executeKubernetesDeploy(): ExecuteGoal {
    return async (goalInvocation: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { configuration, context, sdmGoal, progressLog } = goalInvocation;
        if (!sdmGoal || !sdmGoal.push || !sdmGoal.push.after || !sdmGoal.push.after.images ||
            sdmGoal.push.after.images.length < 1) {
            const msg = `Kubernetes deploy requested but that commit has no Docker image: ${stringify(sdmGoal)}`;
            return logAndFailDeploy(msg, progressLog);
        }
        const image = sdmGoal.push.after.images[0].imageName;
        const options: KubernetesDeployOptions = {
            environment: configuration.environment,
            ...configuration.sdm.k8,
            image,
        };
        return deployApplication(sdmGoal, context, options, progressLog);
    };
}

/**
 * Validate the SDM goal has all necessary data.  It will return the
 * KubeApplication data if the deployment should proceed.  It will
 * return `undefined` if nothing should be deployed.
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
 * Log and return failure.
 *
 * @param message informative error message
 * @return a failure handler result using the provided error message
 */
function logAndFailDeploy(message: string, log?: ProgressLog): HandlerResult {
    if (log) {
        log.write(message);
    }
    logger.error(message);
    return { code: 1, message };
}

/**
 * Check if the SDM is running in side-effect fulfillment mode.  If
 * not, there is no need for further checks.  If it is, verify that
 * the deployment of the application should be fulfilled by this SDM.
 * Ensures the that environment and namespace of the application and
 * deployment parameters match, as appropriate.
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
    deploy: KubernetesDeployCoreOptions,
): KubernetesApplicationOptions | undefined {

    app.ns = (app.ns) ? app.ns : defaultNamespace;
    if (!deploy || !deploy.mode) {
        // not running in side-effect mode
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
