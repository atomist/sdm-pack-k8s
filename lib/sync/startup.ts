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
} from "@atomist/automation-client";
import {
    ProjectLoadingParameters,
    StartupListener,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import * as cluster from "cluster";
import * as _ from "lodash";
import { SyncOptions } from "../config";
import { parseKubernetesSpecFile } from "../deploy/spec";
import { applySpec } from "../kubernetes/apply";
import { decryptSecret } from "../kubernetes/secret";
import { cloneOptions } from "./clone";
import { k8sSpecGlob } from "./diff";
import { queryForScmProvider } from "./repo";

/**
 * If the SDM is registered with one or more workspaces and not
 * running in local mode, query cortex for the sync repo and replace
 * the sdm.k8s.options.sync.repo property with a RemoteRepoRef for
 * that repo.  If this is the master, run [[initialSync]].
 */
export const syncRepoStartupListener: StartupListener = async context => {
    if (isInLocalMode()) {
        return;
    }
    const sdm = context.sdm;
    if (!await queryForScmProvider(sdm)) {
        return;
    }
    if (!cluster.isMaster) {
        return;
    }
    const projectLoadingParameters: ProjectLoadingParameters = {
        credentials: sdm.configuration.sdm.k8s.options.sync.credentials,
        cloneOptions,
        id: sdm.configuration.sdm.k8s.options.sync.repo,
        readOnly: true,
    };
    const opts: SyncOptions = _.get(sdm, "configuration.sdm.k8s.options.sync");
    try {
        await sdm.configuration.sdm.projectLoader.doWithProject(projectLoadingParameters, initialSync(opts));
    } catch (e) {
        e.message = `Failed to perform inital sync using repo ${opts.repo.owner}/${opts.repo.repo}: ${e.message}`;
        logger.error(e.message);
    }
    return;
};

/**
 * Ensure all specs in `syncRepo` have corresponding resources in the
 * Kubernetes cluster.  If the resource does not exist, it is created
 * using the spec.  If it does exist, it is patched using the spec.
 *
 * @param syncRepo Repository of specs to sync
 */
function initialSync(opts: SyncOptions): (p: GitProject) => Promise<void> {
    return async syncRepo => {
        const specFiles = await sortSpecs(syncRepo);
        for (const specFile of specFiles) {
            logger.debug(`Processing spec ${specFile.path}`);
            try {
                let spec = await parseKubernetesSpecFile(specFile);
                if (spec.kind === "Secret" && opts && opts.secretKey) {
                    spec = await decryptSecret(spec, opts.secretKey);
                }
                await applySpec(spec);
            } catch (e) {
                e.message = `Failed to apply '${specFile.path}': ${e.message}`;
                logger.error(e.message);
                throw e;
            }
        }
        return;
    };
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
 * @param syncRepo Repository of specs to sort
 * @return Sorted array of specs in project
 */
export function sortSpecs(syncRepo: GitProject): Promise<ProjectFile[]> {
    return new Promise<ProjectFile[]>((resolve, reject) => {
        const specsStream = syncRepo.streamFiles(k8sSpecGlob);
        const specs: ProjectFile[] = [];
        specsStream.on("data", f => specs.push(f));
        specsStream.on("error", reject);
        specsStream.on("end", () => resolve(specs.sort((a, b) => a.path.localeCompare(b.path))));
    });
}
