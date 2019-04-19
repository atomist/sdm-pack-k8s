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
    RepoRef,
    ScmProviderType,
} from "@atomist/automation-client";
import {
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import * as _ from "lodash";
import { kubernetesUndeploy } from "./commands/kubernetesUndeploy";
import { kubernetesDeployHandler } from "./events/kubernetesDeploy";
import { providerStartupListener } from "./provider/kubernetesCluster";
import { minikubeStartupListener } from "./support/minikube";
import { syncRepoStartupListener } from "./sync/startup";

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
    /*
     * Git SDM provider, e.g., "github_com".  Default is "github_com".
     */
    providerType?: ScmProviderType;
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
    sync?: {
        /**
         * To synchronize resources in k8s cluster with a Git repo,
         * provide a repo ref as the value of this property.  On startup,
         * the contents of this repo ref will be synchronized with the
         * cluster and subsequent resource deployments will update the
         * contents of the repo.
         */
        repo: SyncRepoRef;
    };
}

/**
 * Register Kubernetes deployment support for provided goals.  Any
 * provided `options` are merged with any found in the SDM
 * configuration at `sdm.k8s.options`, i.e.,
 * `sdm.configuration.sdm.k8s.options` if accessing from the SDM
 * object, with those passed in taking precedence.
 *
 * If the merged options result in a truthy `addCommands`, then the
 * [[kubernetesUndeploy]] command is added to the SDM.
 *
 * The [[kubernetesDeployHandler]] event handler for this SDM is added
 * to the SDM.
 *
 * If `sync.repo` is a valid repo ref, synchronizing Kubernetes
 * resources with a Git repository is enabled.
 *
 * The [[minikubeStartupListener]] is added to the SDM to assist
 * running in local mode against a
 * [minikube](https://kubernetes.io/docs/setup/minikube/) cluster.
 *
 * @param options SDM Pack K8s options, see [[SdmPackK8sOptions]].
 * @returns SDM extension pack.
 */
export function k8sSupport(options: SdmPackK8sOptions = {}): ExtensionPack {
    return {
        ...metadata(),
        configure: sdm => {

            const k8sOptions = {
                configuration: {
                    sdm: {
                        k8s: {
                            options,
                        },
                    },
                },
            };
            _.merge(sdm, k8sOptions);

            if (sdm.configuration.sdm.k8s.options.addCommands) {
                sdm.addCommand(kubernetesUndeploy);
            }

            sdm.addEvent(kubernetesDeployHandler(sdm.configuration.name));

            if (sdm.configuration.sdm.k8s.options.registerCluster) {
                sdm.addStartupListener(providerStartupListener);
            }
            if (sdm.configuration.sdm.k8s.options.sync && sdm.configuration.sdm.k8s.options.sync.repo) {
                sdm.addStartupListener(syncRepoStartupListener);
                // TODO: set goals on push to syncRepo
            }
            sdm.addStartupListener(minikubeStartupListener);

        },
    };
}
