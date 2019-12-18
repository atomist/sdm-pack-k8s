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
    Configuration,
    logger,
    Success,
} from "@atomist/automation-client";
import {
    ExecuteGoalResult,
    GoalInvocation,
    GoalWithFulfillment,
    SdmGoalEvent,
    SdmGoalState,
} from "@atomist/sdm";
import { KubernetesApplication } from "../kubernetes/request";
import { getKubernetesGoalEventData } from "./data";
import {
    deployAppId,
    deployApplication,
} from "./deploy";

export const KubernetesDeployExecutorGoalName = "kubernetes-deploy";

export function kubernetesDeployExecutor(): GoalWithFulfillment {
    const goalName = KubernetesDeployExecutorGoalName;
    return new GoalWithFulfillment({ displayName: goalName, uniqueName: goalName })
        .with({
            goalExecutor: executeKubernetesDeploy,
            name: `${goalName}-executor`,
        });
}

export type KubernetesDeployExecutor = (gi: Pick<GoalInvocation, "configuration" | "context" | "goalEvent" | "progressLog">)
    => Promise<ExecuteGoalResult>;

export const executeKubernetesDeploy: KubernetesDeployExecutor = async gi => {
    const { configuration, context, goalEvent, progressLog } = gi;

    const eligible = await eligibleDeployGoal(goalEvent, configuration);
    if (!eligible) {
        progressLog.write("SDM goal event is not eligible for Kubernetes deploy");
        return Success;
    }

    let app: KubernetesApplication;
    try {
        app = getKubernetesGoalEventData(goalEvent);
    } catch (e) {
        e.message = `Invalid SDM goal event data: ${e.message}`;
        progressLog.write(e.message);
        throw e;
    }
    if (!app) {
        progressLog.write("SDM goal event has no Kubernetes application data");
        return Success;
    }
    const appId = deployAppId(goalEvent, context, app);

    try {
        return deployApplication(goalEvent, context, progressLog);
    } catch (e) {
        const message = `Failed to deploy ${appId}: ${e.message}`;
        return { code: 1, message };
    }
};

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
export async function eligibleDeployGoal(goalEvent: SdmGoalEvent, configuration: Configuration): Promise<boolean> {
    if (!goalEvent.fulfillment) {
        logger.debug(`SDM goal contains no fulfillment: ${goalEventString(goalEvent)}`);
        return false;
    }
    if (goalEvent.state !== SdmGoalState.in_process) {
        logger.debug(`SDM goal state '${goalEvent.state}' is not 'in_process'`);
        return false;
    }
    const name = configuration.name;
    if (goalEvent.fulfillment.name !== name) {
        logger.debug(`SDM goal fulfillment name '${goalEvent.fulfillment.name}' is not '${name}'`);
        return false;
    }
    return true;
}

/** Unique string for goal event. */
export function goalEventString(goalEvent: SdmGoalEvent): string {
    return `${goalEvent.goalSetId}/${goalEvent.uniqueName}`;
}
