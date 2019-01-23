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
    HandlerResult,
    LeveledLogMethod,
    logger,
} from "@atomist/automation-client";
import {
    ExecuteGoalResult,
    ProgressLog,
    SdmGoalEvent,
} from "@atomist/sdm";
import { upsertApplication } from "../kubernetes/application";
import { endpointBaseUrl } from "../kubernetes/endpoint";
import {
    isKubernetesApplication,
    KubernetesApplication,
} from "../kubernetes/request";
import { getKubernetesGoalEventData } from "./data";

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
export async function deployApplication(goalEvent: SdmGoalEvent, context: HandlerContext, log?: ProgressLog): Promise<ExecuteGoalResult> {

    let appId = deployAppId(goalEvent, context);
    llog(`Processing ${appId}`, logger.debug, log);

    let app: KubernetesApplication;
    try {
        app = getKubernetesGoalEventData(goalEvent);
    } catch (e) {
        return logAndFailDeploy(`No valid goal event data found for ${appId}: ${e.message}`, log);
    }

    if (!isKubernetesApplication(app)) {
        return logAndFailDeploy(`No valid Kubernetes goal event data found for ${appId}`, log);
    }
    appId = deployAppId(goalEvent, context, app);

    llog(`Deploying ${appId} to Kubernetes`, logger.info, log);
    try {
        await upsertApplication(app);
    } catch (e) {
        return logAndFailDeploy(`Failed to deploy ${appId} to Kubernetes: ${e.message}`, log);
    }
    const message = `Successfully deployed ${appId} to Kubernetes`;
    llog(message, logger.info, log);
    const description = `Deployed to Kubernetes environment \`${app.environment}\` and namespace \`${app.ns}\``;
    const label = `Kubernetes ${app.environment}:${app.ns}`;
    const externalUrls = (app.path && app.host) ? [{ label, url: endpointBaseUrl(app) }] : undefined;
    return { code: 0, message, description, externalUrls };
}

/** Create a descriptive string for a goal event. */
export function deployAppId(g: SdmGoalEvent, c: HandlerContext, a?: KubernetesApplication): string {
    const app = (a) ? `:${a.environment}/${a.ns}/${a.name}` : "";
    return `${c.workspaceId}:${g.repo.owner}/${g.repo.name}:${g.sha}${app}`;
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
function logAndFailDeploy(message: string, log?: ProgressLog): HandlerResult {
    llog(message, logger.error, log);
    return { code: 1, message };
}
