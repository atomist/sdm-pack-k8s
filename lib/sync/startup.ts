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
    CloneOptions,
    GitCommandGitProject,
    GitProject,
    logger,
    ProjectFile,
    ProjectOperationCredentials,
    QueryNoCacheOptions,
    RemoteRepoRef,
    RepoRef,
} from "@atomist/automation-client";
import {
    ProjectLoadingParameters,
    SoftwareDeliveryMachine,
    StartupListener,
    // projectLoaderRepoLoader,
} from "@atomist/sdm";
import {
    DefaultRepoRefResolver,
    isInLocalMode,
} from "@atomist/sdm-core";
import * as cluster from "cluster";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import * as path from "path";
import { applySpecFile } from "../kubernetes/apply";
import {
    RepoScmProvider,
    ScmProviders,
} from "../typings/types";

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
    if (!sdm || !sdm.configuration || !sdm.configuration.workspaceIds) {
        logger.warn(`SDM configuration contains no workspace IDs, not syncing with repo`);
        return;
    }
    const repoRef: RepoRef = _.get(sdm, "configuration.sdm.k8s.options.syncRepo");
    if (!repoRef || !repoRef.owner || !repoRef.repo) {
        logger.error(`Provided repo ref does not contain all required properties: ${stringify(repoRef)}`);
        return;
    }
    const repoCreds = await queryForScmProvider(sdm, repoRef);
    const projectLoadingParameters: ProjectLoadingParameters = {
        credentials: repoCreds.credentials,
        cloneOptions,
        id: repoCreds.id,
        readOnly: true,
    };
    await sdm.configuration.sdm.projectLoader.doWithProject(projectLoadingParameters, initialSync);
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
            await applySpecFile(path.join(syncRepo.baseDir, specFile.path));
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

export interface RepoCredentials {
    credentials: ProjectOperationCredentials;
    id: RemoteRepoRef;
}

/**
 * Cycling through all workspaces, query cortex for a repo matching
 * the provided `repoRef`.  If none found, cycle through all the
 * workspaces again querying for all SCM providers and try to clone
 * the repo with the SCM provider credentials.  Once a repo is found
 * using either method, an object is returned with its remote repo ref
 * and credentials able to clone it.
 *
 * @param sdm this SDM object
 * @param repoRef repository to look for
 * @return repository credentials for the repo or undefined if no repo found
 */
export async function queryForScmProvider(sdm: SoftwareDeliveryMachine, repoRef: RepoRef): Promise<RepoCredentials | undefined> {
    const slug = `${repoRef.owner}/${repoRef.repo}`;

    for (const workspaceId of sdm.configuration.workspaceIds) {
        const graphClient = sdm.configuration.graphql.client.factory.create(workspaceId, sdm.configuration);
        logger.debug(`Querying workspace ${workspaceId} for repo ${slug}`);
        const repos = await graphClient.query<RepoScmProvider.Query, RepoScmProvider.Variables>({
            name: "RepoScmProvider",
            variables: { repo: repoRef.repo, owner: repoRef.owner },
            options: QueryNoCacheOptions,
        });
        if (!repos || !repos.Repo || repos.Repo.length < 1) {
            logger.debug(`Repo ${slug} not found in workspace ${workspaceId}`);
            continue;
        }
        if (repos.Repo.length > 1) {
            logger.warn(`More than repo found in workspace ${workspaceId} with owner/repo ${slug}`);
        }
        for (const repo of repos.Repo) {
            const rc = repoCredentials(repoRef, repo);
            if (rc) {
                logger.warn(`Returning first ${slug} repo with valid SCM provider`);
                return rc;
            }
        }
    }

    for (const workspaceId of sdm.configuration.workspaceIds) {
        const graphClient = sdm.configuration.graphql.client.factory.create(workspaceId, sdm.configuration);
        logger.debug(`Querying workspace ${workspaceId} for SCM providers`);
        const providers = await graphClient.query<ScmProviders.Query, ScmProviders.Variables>({
            name: "ScmProviders",
            options: QueryNoCacheOptions,
        });
        if (!providers || !providers.SCMProvider || providers.SCMProvider.length < 1) {
            logger.debug(`Found no SCM providers in workspace ${workspaceId}`);
            continue;
        }
        for (const provider of providers.SCMProvider) {
            const rc = scmCredentials(repoRef, provider);
            if (rc) {
                logger.debug(`Attempting to clone ${slug} using ${rc.id.cloneUrl}`);
                try {
                    const p = await GitCommandGitProject.cloned(rc.credentials, rc.id, cloneOptions);
                    if (p) {
                        return rc;
                    }
                } catch (e) {
                    logger.debug(`Failed to clone ${slug} from ${rc.id.cloneUrl}: ${e.message}`);
                }
            }
        }
    }

    return undefined;
}

const cloneOptions: CloneOptions = {
    alwaysDeep: false,
    depth: 1,
    detachHead: false,
    keep: false,
};

export function repoCredentials(repoRef: RepoRef, repo: RepoScmProvider.Repo): RepoCredentials | undefined {
    if (repo.org && repo.org.scmProvider) {
        return scmCredentials(repoRef, repo.org.scmProvider);
    }
    return undefined;
}

export function scmCredentials(repoRef: RepoRef, scm: ScmProviders.ScmProvider): RepoCredentials | undefined {
    if (repoRef && repoRef.owner && repoRef.repo && scm.apiUrl && scm.credential && scm.credential.secret) {
        const repoResolver = new DefaultRepoRefResolver();
        const repo = {
            owner: repoRef.owner,
            name: repoRef.repo,
            org: {
                owner: repoRef.owner,
                provider: {
                    providerId: scm.providerId,
                    providerType: scm.providerType,
                    apiUrl: scm.apiUrl,
                    url: scm.url,
                },
            },
        };
        const options = {
            sha: repoRef.sha,
            branch: repoRef.branch,
        };
        try {
            const id = repoResolver.toRemoteRepoRef(repo, options);
            return {
                credentials: { token: scm.credential.secret },
                id,
            };
        } catch (e) {
            logger.warn(`Failed to resolve remote repo ref for ${repo.owner}/${repo.name}: ${e.message}`);
        }
    }
    return undefined;
}
