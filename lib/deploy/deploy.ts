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
    HandlerContext,
    LeveledLogMethod,
    logger,
} from "@atomist/automation-client";
import {
    ExecuteGoalResult,
    ProgressLog,
    SdmGoalEvent,
} from "@atomist/sdm";
import { upsertApplication } from "../kubernetes/application";
import {
    isKubernetesApplication,
    KubernetesApplication,
} from "../kubernetes/request";
import { getKubernetesGoalEventData } from "./data";
import { appExternalUrls } from "./externalUrls";

/**
 * Given an SdmGoalEvent with the appropriate Kubernetes application
 * data, deploy an application to a Kubernetes cluster.
 *
 * @param goalEvent The Kubernetes deployment goal
 * @param context A standard handler context available from goal executions
 *                or event handlers
 * @param log     SDM goal progress log
 * @return Goal success or failure, with endpoint URL(s) on success if
 *         ingress properties are set
 */
export async function deployApplication(goalEvent: SdmGoalEvent, context: HandlerContext, log: ProgressLog): Promise<ExecuteGoalResult> {

    let appId = deployAppId(goalEvent, context);
    llog(`Processing ${appId}`, logger.debug, log);

    let app: KubernetesApplication;
    try {
        app = getKubernetesGoalEventData(goalEvent);
    } catch (e) {
        return logAndFailDeploy(`No valid goal event data found for ${appId}: ${e.message}`, log, goalEvent);
    }

    if (!isKubernetesApplication(app)) {
        return logAndFailDeploy(`No valid Kubernetes goal event data found for ${appId}`, log, goalEvent, app);
    }
    appId = deployAppId(goalEvent, context, app);

    llog(`Deploying ${appId} to Kubernetes`, logger.info, log);
    try {
        await upsertApplication(app, goalEvent.fulfillment.name);
    } catch (e) {
        return logAndFailDeploy(`Failed to deploy ${appId} to Kubernetes: ${e.message}`, log, goalEvent, app);
    }
    const message = `Successfully deployed ${appId} to Kubernetes`;
    llog(message, logger.info, log);
    const description = deployDescription(goalEvent, app);
    const externalUrls = await appExternalUrls(app, goalEvent);
    return { code: 0, description, externalUrls, message };
}

/** Create a descriptive string for a goal event. */
export function deployAppId(g: SdmGoalEvent, c: HandlerContext, a?: KubernetesApplication): string {
    const app = (a) ? `/${a.ns}/${a.name}` : "";
    return `${c.workspaceId}:${g.repo.owner}/${g.repo.name}:${g.sha}:${g.fulfillment.name}${app}`;
}

/**
 * Log to a specific log level method and optionally a progress log.
 *
 * @param ll Levelled log method like `logger.debug()`
 * @param log goal progress log
 */
export function llog(message: string, ll: LeveledLogMethod, log: ProgressLog): void {
    log.write(message);
    ll(message);
}

/**
 * Log and return failure.
 *
 * @param message informative error message
 * @return a failure handler result using the provided error message
 */
function logAndFailDeploy(message: string, log: ProgressLog, goalEvent: SdmGoalEvent, app?: KubernetesApplication): ExecuteGoalResult {
    llog(message, logger.error, log);
    const dest = destination(goalEvent, app);
    const description = `Deploy \`${dest}\` failed`;
    return { code: 1, description, message };
}

/**
 * Create identifying deployment destination from fulillment name,
 * application namespace, and application name.
 */
export function destination(goalEvent: SdmGoalEvent, app?: KubernetesApplication): string {
    const cluster = goalEvent.fulfillment.name.replace(/^@[^\/]*\//, "").replace(/^.*?_/, "");
    const nsName = (app) ? `:${app.ns}/${app.name}` : "";
    return `${cluster}${nsName}`;
}

/**
 * Create goal description for a deployed application containing the
 * Kubernetes cluster, namespace, and application name.  The cluster
 * name is parsed from the goal fulfillment name, stripping any NPM
 * scope and everything before the first underscore, `_`, if they
 * exist.
 *
 * @param app Application deployed to Kubernetes.
 * @param goalEvent SDM goal event that triggered the deployment.
 * @return Description of deployment.
 */
export function deployDescription(goalEvent: SdmGoalEvent, app: KubernetesApplication): string {
    const dest = destination(goalEvent, app);
    return `Deployed \`${dest}\``;
}
