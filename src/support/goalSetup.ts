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

import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { SdmGoal } from "@atomist/sdm/ingesters/sdmGoalIngester";
import * as path from "path";

export interface KubernetesDeploymentOptions {
    name: string;
    environment: string;

    ns?: string;
    imagePullSecret?: string;
    port?: number;
    path?: string;
    host?: string;
    protocol?: string;
    replicas?: number;
}

/**
 * Sets kubernetes deployment specific data to an SdmGoal
 * @param {SdmGoal} goal
 * @param {KubernetesDeploymentOptions} options
 * @param {GitProject} p
 * @returns {Promise<SdmGoal>}
 */
export async function createKubernetesData(goal: SdmGoal, options: KubernetesDeploymentOptions, p: GitProject): Promise<SdmGoal> {
    const deploymentSpec = await readKubernetesSpec(p, "deployment.json");
    const serviceSpec = await readKubernetesSpec(p, "service.json");
    return {
        ...goal,
        data: JSON.stringify({
            kubernetes: {
                ...options,
                deploymentSpec,
                serviceSpec,
            },
        }),
    };
}

/**
 * Reads Kubernetes deployment.json and service.json specs from the project's .atomist/kubernetes folder
 * @param {GitProject} p
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function readKubernetesSpec(p: GitProject, name: string): Promise<string> {
    const specPath = path.join(".atomist", "kubernetes", name);
    if (p.fileExistsSync(specPath)) {
        return (await p.getFile(specPath)).getContent();
    } else {
        return undefined;
    }
}
