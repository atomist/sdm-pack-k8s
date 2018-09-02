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
    ExtensionPack,
    Goal,
    PushTest,
    SdmGoalEvent,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import { metadata } from "@atomist/sdm/api-helper/misc/extensionPack";
import { RepoContext } from "@atomist/sdm/api/context/SdmContext";
import {
    executeKubernetesDeploy,
    KubernetesDeployerOptions,
} from "./support/deploy";

/**
 * Configuration options to be passed to the Extension Pack creation.
 * Deployments can be configured based on goals and push tests. Each
 * deployment can be configured using a callback to prepare the deployment
 * and service spec data needed to triggered customized deployments.
 */
export interface KubernetesOptions {
    deployments: Array<{
        goal: Goal;
        pushTest?: PushTest;
        callback?: (goal: SdmGoalEvent, context: RepoContext) => Promise<SdmGoalEvent>;
    }>;
}

/**
 * Register Kubernetes deployment support for provided goals.
 * @param {KubernetesOptions} options
 * @returns {ExtensionPack}
 */
export function kubernetesSupport(options: KubernetesOptions): ExtensionPack {
    return {
        ...metadata(),
        requiredConfigurationValues: isInLocalMode() ? [
            "sdm.k8.environment",
        ] : [],
        configure: sdm => {

            options.deployments.forEach(deployment => {

                if (isInLocalMode()) {
                    sdm.addGoalImplementation(
                        `k8-deploy-${deployment.goal.name.toLowerCase()}`,
                        deployment.goal,
                        executeKubernetesDeploy(sdm.configuration.sdm.k8 as KubernetesDeployerOptions),
                        {
                            pushTest: deployment.pushTest,
                        });
                } else {
                    sdm.goalFulfillmentMapper.addSideEffect({
                        goal: deployment.goal,
                        pushTest: deployment.pushTest,
                        sideEffectName: "@atomist/k8-automation",
                    });
                }
                if (deployment.callback) {
                    sdm.goalFulfillmentMapper.addFulfillmentCallback({
                        goal: deployment.goal,
                        callback: deployment.callback,
                    });
                }
            });

        },
    };
}
