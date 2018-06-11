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
} from "@atomist/sdm";
import { RepoContext } from "@atomist/sdm/api/context/SdmContext";
import { SdmGoal } from "@atomist/sdm/ingesters/sdmGoalIngester";

// tslint:disable-next-line:no-var-requires
const pj = require("./package.json");

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
        callback?: (goal: SdmGoal, context: RepoContext) => Promise<SdmGoal>;
    }>;
}

/**
 * Register Kubernetes deployment support for provided goals.
 * @param {KubernetesOptions} options
 * @returns {ExtensionPack}
 */
export function kubernetesSupport(options: KubernetesOptions): ExtensionPack {
    return {
        name: pj.name,
        vendor: pj.author.name,
        version: pj.version,
        configure: sdm => {

            options.deployments.forEach(deployment => {
                sdm.goalFulfillmentMapper.addSideEffect({
                    goal: deployment.goal,
                    pushTest: deployment.pushTest,
                    sideEffectName: "@atomist/k8-automation",
                });

                if (deployment.callback) {
                    sdm.goalFulfillmentMapper.addFullfillmentCallback({
                        goal: deployment.goal,
                        callback: deployment.callback,
                    });
                }
            });

        },
    };
}
