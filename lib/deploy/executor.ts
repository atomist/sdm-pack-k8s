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
    ExecuteGoalResult,
    GoalInvocation,
    GoalWithFulfillment,
} from "@atomist/sdm";
import { KubernetesApplication } from "../kubernetes/request";
import { getKubernetesGoalEventData } from "./data";
import {
    deployAppId,
    deployApplication,
} from "./deploy";

/** Standard name for Kubernetes deployment execution goal. */
export const KubernetesDeployExecutorGoalName = "kubernetes-deploy";

/**
 * Return a goal with a standard name,
 * [[KubernetesDeployExecutorGoalName]], that will fulfill a
 * [[KubernetesDeploy]] goal by executing [[executeKubernetesDeploy]].
 */
export function kubernetesDeployExecutor(): GoalWithFulfillment {
    const goalName = KubernetesDeployExecutorGoalName;
    return new GoalWithFulfillment({ displayName: goalName, uniqueName: goalName })
        .with({
            goalExecutor: executeKubernetesDeploy,
            name: `${goalName}-executor`,
        });
}

/**
 * Type for [[executeKubernetesDeploy]] which is compatible with
 * [[ExecuteGoal]].
 */
export type KubernetesDeployExecutor = (gi: Pick<GoalInvocation, "context" | "goalEvent" | "progressLog">) => Promise<ExecuteGoalResult>;

/**
 * Extract [[KubernetesApplication]] from goal event data property and
 * deploy the application to the Kubernetes cluster using
 * [[deployApplication]].
 */
export const executeKubernetesDeploy: KubernetesDeployExecutor = async gi => {
    const { context, goalEvent, progressLog } = gi;

    let app: KubernetesApplication;
    try {
        app = getKubernetesGoalEventData(goalEvent);
    } catch (e) {
        e.message = `Invalid SDM goal event data: ${e.message}`;
        progressLog.write(e.message);
        throw e;
    }
    if (!app) {
        const message = "SDM goal event has no Kubernetes application data";
        progressLog.write(message);
        return { code: 0, message };
    }
    const appId = deployAppId(goalEvent, context, app);

    try {
        return deployApplication(goalEvent, context, progressLog);
    } catch (e) {
        const message = `Failed to deploy ${appId}: ${e.message}`;
        return { code: 1, message };
    }
};
