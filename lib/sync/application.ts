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
    configurationValue,
    GitProject,
    guid,
    logger,
    ProjectFile,
    ProjectOperationCredentials,
    projectUtils,
    RemoteRepoRef,
} from "@atomist/automation-client";
import {
    CachingProjectLoader,
    ProjectLoader,
    ProjectLoadingParameters,
} from "@atomist/sdm";
import * as k8s from "@kubernetes/client-node";
import * as yaml from "js-yaml";
import * as stringify from "json-stringify-safe";
import { parseKubernetesSpecFile } from "../deploy/spec";
import {
    appName,
    KubernetesApplication,
} from "../kubernetes/request";
import { cloneOptions } from "./clone";
import { k8sSpecGlob } from "./diff";
import { commitTag } from "./tag";

/**
 * Synchronize changes from deploying app to the configured syncRepo.
 * If no syncRepo is configured, do nothing.
 *
 * @param resources Kubernetes resource objects to synchronize
 * @param goalEvent SDM goal event triggering the application upsert
 * @param context SDM event handler context
 */
export async function syncApplication(app: KubernetesApplication, resources: k8s.KubernetesObject[]): Promise<void> {
    const slug = appName(app);
    const syncRepo: RemoteRepoRef = configurationValue("sdm.k8s.options.sync.repo", undefined);
    if (!syncRepo) {
        return;
    }
    if (resources.length < 1) {
        return;
    }
    const credentials: ProjectOperationCredentials = configurationValue("sdm.k8s.options.sync.credentials");
    const projectLoadingParameters: ProjectLoadingParameters = {
        credentials,
        cloneOptions,
        id: syncRepo,
        readOnly: false,
    };
    const projectLoader: ProjectLoader = configurationValue("sdm.projectLoader", new CachingProjectLoader());
    try {
        await projectLoader.doWithProject(projectLoadingParameters, syncResources(app, resources));
    } catch (e) {
        e.message = `Failed to perform sync resources from ${slug} to sync repo ${syncRepo.owner}/${syncRepo.repo}: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    return;
}

/**
 * Update the sync repo with the upserted resources from a
 * KubernetesApplication.  For each upserted resource in `resources`,
 * loop through all the existing Kubernetes spec files, i.e., those
 * that match [[k8sSpecGlob]], to see if the apiVersion, kind, name,
 * and namespace, which may be undefined, match.  If a match is found,
 * update that spec file.  If no match is found, create a unique file
 * name and store the resource spec in it.  If changes are made,
 * commit and push the changes.
 *
 * @param app Kubernetes application object
 * @param resources Resources that were upserted as part of this application
 * @return Function that updates the sync repo with the resource specs
 */
export function syncResources(app: KubernetesApplication, resources: k8s.KubernetesObject[]): (p: GitProject) => Promise<void> {
    return async syncProject => {
        const specs: Array<{ file: ProjectFile, spec: k8s.KubernetesObject }> = [];
        await projectUtils.doWithFiles(syncProject, k8sSpecGlob, async specFile => {
            try {
                const spec: k8s.KubernetesObject = await parseKubernetesSpecFile(specFile);
                specs.push({ file: specFile, spec });
            } catch (e) {
                logger.warn(`Failed to process sync repo spec ${specFile.path}, ignoring: ${e.message}`);
            }
        });
        for (const resource of resources) {
            let found = false;
            for (const sf of specs) {
                if (resource.apiVersion === sf.spec.apiVersion && resource.kind === sf.spec.kind &&
                    resource.metadata.name === sf.spec.metadata.name && resource.metadata.namespace === sf.spec.metadata.namespace) {
                    const specString = (/\.ya?ml$/.test(sf.file.path)) ? yaml.safeDump(resource) : stringifySpec(resource);
                    await sf.file.setContent(specString);
                    found = true;
                }
            }
            if (!found) {
                const specRoot = specFileBasename(resource);
                const specExt = ".json";
                let specPath = specRoot + specExt;
                while (await syncProject.getFile(specPath)) {
                    specPath = specRoot + "-" + guid().split("-")[0] + specExt;
                }
                await syncProject.addFile(specPath, stringifySpec(resource));
            }
        }
        if (await syncProject.isClean()) {
            return;
        }
        try {
            await syncProject.commit(`Update specs for ${appName(app)}\n\n[atomist:generated] ${commitTag()}\n`);
            await syncProject.push();
        } catch (e) {
            e.message = `Failed to commit and push resource changes to sync repo: ${e.message}`;
            logger.error(e.message);
            throw e;
        }
    };
}

/**
 * Create a suitable basename for the spec file for `resource`.  The
 * form of the file name is "NAMESPACE-NAME-KIND", where "NAMESPACE-"
 * is omitted if resource is not namespaced,, the kind is converted
 * from PascalCase to kebab-case, and the whole name is lowercased.
 *
 * @param resource Kubernetes resource spec
 * @return Base file name for resource spec
 */
export function specFileBasename(resource: k8s.KubernetesObject): string {
    const ns = (resource.metadata.namespace) ? `${resource.metadata.namespace}-` : "";
    return `${ns}${resource.metadata.name}-${resource.kind.replace(/([a-z])([A-Z])/g, "$1-$2")}`.toLowerCase();
}

function stringifySpec(resource: k8s.KubernetesObject): string {
    return stringify(resource, undefined, 2) + "\n";
}
