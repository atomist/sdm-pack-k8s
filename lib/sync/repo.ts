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
    GitCommandGitProject,
    logger,
    ProjectOperationCredentials,
    QueryNoCacheOptions,
    RemoteRepoRef,
    RepoRef,
} from "@atomist/automation-client";
import { SoftwareDeliveryMachine } from "@atomist/sdm";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { SyncOptions } from "../config";
import {
    RepoScmProvider,
    ScmProviders,
} from "../typings/types";
import { cloneOptions } from "./clone";

export interface RepoCredentials {
    credentials: ProjectOperationCredentials;
    repo: RemoteRepoRef;
}

const defaultDefaultBranch = "master";

/**
 * Cycling through all workspaces, query cortex for a repo matching
 * the provided `repoRef`.  If none found, cycle through all the
 * workspaces again querying for all SCM providers and try to clone
 * the repo with the SCM provider credentials.  Once a repo is found
 * using either method, an object is returned with its remote repo ref
 * and credentials able to clone it.  In addition, the `sdm` passed in
 * will have its `sdm.configuration.sdm.k8s.options.sync` updated with
 * the object returned, with properties set under the
 * `sdm.configuration` taking precedence over those found by querying
 * cortex, which may or may not be a good idea but maybe you know
 * better than the graph.
 *
 * @param sdm this SDM object (modified if repo credentials found)
 * @param repoRef repository to look for
 * @return repository credentials for the repo or undefined if no repo found
 */
export async function queryForScmProvider(sdm: SoftwareDeliveryMachine): Promise<RepoCredentials | undefined> {
    const syncOptions: SyncOptions = _.get(sdm, "configuration.sdm.k8s.options.sync");
    if (!syncOptions) {
        logger.warn(`SDM configuration contains to sync repo`);
        return undefined;
    }
    const repoRef = syncOptions.repo;
    if (!repoRef || !repoRef.owner || !repoRef.repo) {
        logger.error(`Provided repo ref does not contain all required properties: ${stringify(repoRef)}`);
        return undefined;
    }

    const repoCreds = await queryRepo(sdm, repoRef) || await queryScm(sdm, repoRef);
    if (repoCreds) {
        _.defaultsDeep(sdm.configuration.sdm.k8s.options.sync, repoCreds);
        return sdm.configuration.sdm.k8s.options.sync;
    }
    return undefined;
}

export function repoCredentials(sdm: SoftwareDeliveryMachine, repoRef: RepoRef, repo: RepoScmProvider.Repo): RepoCredentials | undefined {
    if (repo.org && repo.org.scmProvider) {
        return scmCredentials(sdm, repoRef, repo.org.scmProvider);
    }
    return undefined;
}

export function scmCredentials(sdm: SoftwareDeliveryMachine, repoRef: RepoRef, scm: ScmProviders.ScmProvider): RepoCredentials | undefined {
    if (repoRef && repoRef.owner && repoRef.repo && scm.apiUrl && scm.credential && scm.credential.secret) {
        const repoResolver = sdm.configuration.sdm.repoRefResolver;
        const repoFrag = {
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
            const repo = repoResolver.toRemoteRepoRef(repoFrag, options);
            return {
                credentials: { token: scm.credential.secret },
                repo,
            };
        } catch (e) {
            logger.warn(`Failed to resolve remote repo ref for ${repoFrag.owner}/${repoFrag.name}: ${e.message}`);
        }
    }
    return undefined;
}

function repoSlug(repo: RepoRef): string {
    return `${repo.owner}/${repo.repo}`;
}

/**
 * Query cortex across all available workspaces for repo.
 */
async function queryRepo(sdm: SoftwareDeliveryMachine, repoRef: RepoRef): Promise<RepoCredentials | undefined> {
    const slug = repoSlug(repoRef);
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
            const rc = repoCredentials(sdm, repoRef, repo);
            if (rc) {
                // hack to record default branch if we know it
                rc.repo.branch = repo.defaultBranch || defaultDefaultBranch;
                logger.warn(`Returning first ${slug} repo with valid SCM provider`);
                return rc;
            }
        }
    }
    return undefined;
}

/**
 * For each SDM provider in cortex in each workspace, try to clone the
 * sync repo.  Return the information for the first successful clone.
 */
async function queryScm(sdm: SoftwareDeliveryMachine, repoRef: RepoRef): Promise<RepoCredentials | undefined> {
    const slug = repoSlug(repoRef);
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
            const rc = scmCredentials(sdm, repoRef, provider);
            if (rc) {
                logger.debug(`Attempting to clone ${slug} using ${rc.repo.cloneUrl}`);
                try {
                    const p = await GitCommandGitProject.cloned(rc.credentials, rc.repo, cloneOptions);
                    if (p) {
                        // hack to record default branch
                        rc.repo.branch = p.branch || defaultDefaultBranch;
                        return rc;
                    }
                } catch (e) {
                    logger.debug(`Failed to clone ${slug} from ${rc.repo.cloneUrl}: ${e.message}`);
                }
            }
        }
    }
    return undefined;
}
