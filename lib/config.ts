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
    ProjectOperationCredentials,
    RepoRef,
    ScmProviderType,
} from "@atomist/automation-client";

/**
 * Information needed to create a proper RemoteRepoRef for the
 * [[SdmPackK8sOptions.syncRepo]].  If `apiBase` and `providerType`
 * are not provided, cortex is queried to find the information.
 */
export interface SyncRepoRef extends RepoRef {
    /**
     * Root API URL.  Default is dependent on [[providerType]].
     */
    apiBase?: string;
    /**
     * If branch is provided, it is used.  If it is not provided,
     * things get complicated.  If the repo exists in the graph and it
     * has the defaultBranch property set, then it is used.  If the
     * repo does not exist in the graph or its defaultBranch property
     * is not set, "master" is used.  Long story short, even though
     * branch is optional, set it if you want sync repo to behave
     * deterministically.
     */
    branch?: string;
    /*
     * Git SDM provider, e.g., "github_com".  Default is "github_com".
     */
    providerType?: ScmProviderType;
}

/**
 * Configuration options for sync mode operation.
 */
export interface SyncOptions {
    /**
     * To synchronize resources in k8s cluster with a Git repo,
     * provide a repo ref as the value of this property.  On startup,
     * the contents of this repo ref will be synchronized with the
     * cluster and subsequent resource deployments will update the
     * contents of the repo.
     */
    repo: SyncRepoRef;
    /**
     * Credentials to use when cloning the sync.repo.  These are
     * typically not provided in the SDM configuration and, if
     * they are not provided, are obtained during startup by the
     * SDM via a cortex query.
     */
    credentials?: ProjectOperationCredentials;
}

/**
 * Configuration options to be passed to the extension pack creation.
 */
export interface SdmPackK8sOptions {
    /**
     * Whether to add the undelete command.  Typically you would only
     * want to enable this in one SDM per workspace.  If no value is
     * provided, the comand is not added.
     */
    addCommands?: boolean;

    /**
     * Whether to register and converge a k8s cluster.  Typically this
     * is used from k8s-sdm to manage k8s cluster it is running in.
     */
    registerCluster?: boolean;

    /**
     * Synchronize resources in k8s cluster with a Git repo.
     */
    sync?: SyncOptions;
}
