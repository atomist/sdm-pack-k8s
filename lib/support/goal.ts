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
    GitProject,
    logger,
    Project,
} from "@atomist/automation-client";
import {
    SdmGoalEvent,
} from "@atomist/sdm";
import * as path from "path";
import {
    KubernetesApplicationOptions,
} from "./options";

/**
 * Subset of KubeApplication properties, omitting those that are
 * typically gotten from the context or build.  See the
 * [[KubeApplication]] documentation for property documentation.
 */
export interface KubernetesGoalData extends KubernetesApplicationOptions {
    deploymentSpec?: string;
    serviceSpec?: string;
}

/**
 * Adds Kubernetes application data to an SDM goal.  The objects
 * written under the kubernetes property is of type
 * [[KubeApplicationSpec]].
 *
 * @param goal SDM goal to add Kubernetes data to
 * @param options Kubernetes application options to set on the goal
 * @param p Project this goal is operating on
 * @returns SDM goal with Kuberenetes application properties set
 */
export async function createKubernetesData(goal: SdmGoalEvent,
                                           options: KubernetesApplicationOptions,
                                           p: GitProject): Promise<SdmGoalEvent> {

    const deploymentSpec = await readKubernetesSpec(p, "deployment.json");
    const serviceSpec = await readKubernetesSpec(p, "service.json");
    const kubernetesGoalData: KubernetesGoalData = {
        ...options,
        deploymentSpec,
        serviceSpec,
    };
    return {
        ...goal,
        data: JSON.stringify({ kubernetes: kubernetesGoalData }),
    };
}

/**
 * Reads Kubernetes deployment.json and service.json specs from the
 * project's .atomist/kubernetes folder.  It swallows all exceptions,
 * returning undefined if one occurs.
 *
 * @param p Project to look for spec file in
 * @param name File name of spec under .atomist/kubernetes
 * @returns a string if the spec was successfully read, undefined otherwise
 */
export async function readKubernetesSpec(p: Project, name: string): Promise<string | undefined> {
    const specPath = path.join(".atomist", "kubernetes", name);
    try {
        const specFile = await p.getFile(specPath);
        if (specFile) {
            const spec = specFile.getContent();
            return spec;
        }
    } catch (e) {
        logger.warn(`Failed to read spec file ${specPath}: ${e.message}`);
    }
    return undefined;
}
