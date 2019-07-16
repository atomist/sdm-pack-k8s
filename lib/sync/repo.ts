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
import { isRemoteRepoRef } from "@atomist/automation-client/lib/operations/common/RepoId";
import { SoftwareDeliveryMachine } from "@atomist/sdm";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import {
    KubernetesSyncOptions,
    SyncRepoRef,
} from "../config";
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
 * If called and no sync repo is provided in the SDM configuration, a
 * warning is emitted and `undefined` is returned.
 *
 * If the SDM configuration contains a RemoteRepoRef as the value of
 * the `sdm.configuration.sdm.k8s.options.sync.repo` option and truthy
 * credentials, those are returned.
 *
 * Otherwise, the code cycles through all workspaces, querying cortex
 * for the information it needs.  If the value of the `sync.repo`
 * option is a [[SyncRepoRef]], each workspace is queried for a repo
 * matching the provided sync repo.  If none is found, it cycles
 * through all the workspaces again querying for all SCM providers and
 * try to clone the repo with the provided credentials or, if no
 * credentials are provided, the SCM provider credentials from cortex.
 * Once a repo is found using either method, an object is returned
 * with its remote repo ref and the credentials able to clone it.  In
 * addition, the `sdm` passed in will have its
 * `sdm.configuration.sdm.k8s.options.sync.repo`
 * and`sdm.configuration.sdm.k8s.options.sync.credentials` updated
 * with the objects appropriate objects.
 *
 * @param sdm this SDM object (modified if repo credentials found)
 * @param repoRef repository to look for
 * @return true if sync options set and repo found or false and sync options deleted
 */
export async function queryForScmProvider(sdm: SoftwareDeliveryMachine): Promise<boolean> {
    const syncOptions: KubernetesSyncOptions = _.get(sdm, "configuration.sdm.k8s.options.sync");
    if (!syncOptions) {
        logger.info(`SDM configuration contains no sync repo`);
        return false;
    }
    const repoRef = syncOptions.repo;
    if (!repoRef || !repoRef.owner || !repoRef.repo) {
        logger.error(`Provided sync repo does not contain all required properties, deleting sync options: ${stringify(repoRef)}`);
        delete sdm.configuration.sdm.k8s.options.sync;
        return false;
    }

    const repoProvided = isRemoteRepoRef(repoRef);
    const credsProvided = !!syncOptions.credentials;
    if (repoProvided && credsProvided) {
        logger.info(`Using provided remote repo ref and credentials for sync repo`);
        return true;
    }

    const repoCreds = await queryRepo(sdm) || await queryScm(sdm);
    if (repoCreds) {
        if (!repoProvided) {
            sdm.configuration.sdm.k8s.options.sync.repo = repoCreds.repo;
        }
        if (!credsProvided) {
            sdm.configuration.sdm.k8s.options.sync.credentials = repoCreds.credentials;
        }
        return true;
    }
    logger.warn(`Failed to find sync repo, deleting sync options: ${stringify(repoRef)}`);
    delete sdm.configuration.sdm.k8s.options.sync;
    return false;
}

export function repoCredentials(sdm: SoftwareDeliveryMachine, repo: RepoScmProvider.Repo): RepoCredentials | undefined {
    if (repo.org && repo.org.scmProvider) {
        return scmCredentials(sdm, repo.org.scmProvider);
    }
    return undefined;
}

export function scmCredentials(sdm: SoftwareDeliveryMachine, scm: ScmProviders.ScmProvider): RepoCredentials | undefined {
    const repoRef = syncRepoRef(sdm);
    const credentials = _.get(sdm, "configuration.sdm.k8s.options.sync.credentials");
    const secret = _.get(scm, "credential.secret");
    if (repoRef && repoRef.owner && repoRef.repo && scm.apiUrl && (credentials || secret)) {
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
            // RepoRefResolver does support setting path when creating
            repo.path = repo.path || repoRef.path;
            return {
                credentials: credentials || { token: scm.credential.secret },
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

function syncRepoRef(sdm: SoftwareDeliveryMachine): SyncRepoRef | RemoteRepoRef | undefined {
    return _.get(sdm, "configuration.sdm.k8s.options.sync.repo");
}

/**
 * Query cortex across all available workspaces for repo.
 */
async function queryRepo(sdm: SoftwareDeliveryMachine): Promise<RepoCredentials | undefined> {
    const repoRef = syncRepoRef(sdm);
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
            logger.warn(`More than one repo found in workspace ${workspaceId} with owner/repo ${slug}`);
        }
        for (const repo of repos.Repo) {
            const rc = repoCredentials(sdm, repo);
            if (rc) {
                rc.repo.branch = rc.repo.branch || repo.defaultBranch || defaultDefaultBranch;
                logger.info(`Returning first ${slug} repo with valid SCM provider`);
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
async function queryScm(sdm: SoftwareDeliveryMachine): Promise<RepoCredentials | undefined> {
    const repoRef = syncRepoRef(sdm);
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
            const rc = scmCredentials(sdm, provider);
            if (rc) {
                logger.debug(`Attempting to clone ${slug} using ${rc.repo.cloneUrl}`);
                try {
                    const p = await GitCommandGitProject.cloned(rc.credentials, rc.repo, cloneOptions);
                    if (p) {
                        rc.repo.branch = rc.repo.branch || p.branch || defaultDefaultBranch;
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
