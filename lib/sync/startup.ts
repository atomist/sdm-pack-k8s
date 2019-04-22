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
    GitProject,
    logger,
    ProjectFile,
    RepoRef,
} from "@atomist/automation-client";
import {
    ProjectLoadingParameters,
    StartupListener,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import * as cluster from "cluster";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { EssentialKubernetesObject } from "../kubernetes/api";
import { applySpec } from "../kubernetes/apply";
import { cloneOptions } from "./clone";
import { queryForScmProvider } from "./repo";

/**
 * If the SDM is the cluster master, not running in local mode, and
 * registered with one or more workspaces, ensure that this SDM is
 * available as a KubernetesClusterProvider in those workspaces.
 */
export const syncRepoStartupListener: StartupListener = async context => {
    if (isInLocalMode() || !cluster.isMaster) {
        return;
    }
    const sdm = context.sdm;
    const repoRef: RepoRef = _.get(sdm, "configuration.sdm.k8s.options.sync.repo");
    const repoCreds = await queryForScmProvider(sdm, repoRef);
    if (!repoCreds) {
        logger.warn(`Failed to find sync repo: ${stringify(repoRef)}`);
        return;
    }
    _.merge(context.sdm.configuration.sdm.k8s.options.sync, repoCreds);
    const projectLoadingParameters: ProjectLoadingParameters = {
        credentials: repoCreds.credentials,
        cloneOptions,
        id: repoCreds.repo,
        readOnly: true,
    };
    try {
        await sdm.configuration.sdm.projectLoader.doWithProject(projectLoadingParameters, initialSync);
    } catch (e) {
        e.message = `Failed to perform inital sync using repo ${repoRef.owner}/${repoRef.repo}: ${e.message}`;
        logger.error(e.message);
    }
    return;
};

/**
 * Ensure all specs in `syncRepo` have corresponding resources in the
 * Kubernetes cluster.  If the resource does not exist, it is created
 * using the spec.  If it does exist, it is patched using the spec.
 *
 * @param syncRepo repository of specs to sync
 */
async function initialSync(syncRepo: GitProject): Promise<void> {
    const specFiles = await sortSpecs(syncRepo);
    for (const specFile of specFiles) {
        logger.debug(`Processing spec ${specFile.path}`);
        try {
            const specContent = await specFile.getContent();
            const spec: EssentialKubernetesObject = JSON.parse(specContent);
            await applySpec(spec);
        } catch (e) {
            e.message = `Failed to apply '${specFile.path}': ${e.message}`;
            logger.error(e.message);
            throw e;
        }
    }
    return;
}

/**
 * Consume stream of files from project and sort them by their `path`
 * property using `localeCompare`.  Any file at the root of the
 * project, i.e., not in a subdirectory, having the extensions
 * ".json", ".yaml", or ".yml` are considered specs.
 *
 * Essentially, this function converts a FileStream into a Promise of
 * sorted ProjectFiles.
 *
 * @param syncRepo repository of specs to sort
 * @return sorted array of specs in project
 */
export function sortSpecs(syncRepo: GitProject): Promise<ProjectFile[]> {
    return new Promise<ProjectFile[]>((resolve, reject) => {
        const specsStream = syncRepo.streamFiles("*.@(json|yaml|yml)");
        const specs: ProjectFile[] = [];
        specsStream.on("data", f => specs.push(f));
        specsStream.on("error", reject);
        specsStream.on("end", () => resolve(specs.sort((a, b) => a.path.localeCompare(b.path))));
    });
}
