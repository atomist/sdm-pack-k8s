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
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import * as _ from "lodash";
import { kubernetesUndeploy } from "./commands/kubernetesUndeploy";
import { kubernetesDeployHandler } from "./events/kubernetesDeploy";
import { minikubeStartupListener } from "./support/minikube";

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
     * If the SDM is using default Kubernetes credentials, this
     * specifices the Kubernetes config context to use when
     * communicating with the Kubernetes API.  If not specified, the
     * current context is used.
     *
     * Note that default Kubernetes credentials are typically only
     * used when the SDM is running outside a Kubernetes cluster,
     * e.g., when in local mode.  When running inside a Kubernetes
     * cluster, default credentials, i.e., `$HOME/.kube/config`, can
     * be provided in the container but typically the SDM falls back
     * to the in-cluster Kubernetes credentials provided by the
     * service account.  See [[loadKubeConfig]].
     */
    context?: string;
    /**
     * The namespaces to manage application deployments when
     * fulfilling requested side-effect Kubernetes deployment goals.
     * If it is `undefined`, all deployments requested for fulfillment
     * by this SDM, i.e., the fulfillment name and goal environment
     * matches the name and environment of the SDM, are fulfilled.  If
     * set to an array of namespaces, only deployments requested whose
     * name and environment match those of this SDM _and_ whose
     * Kubernetes application data specifies a namespaces in this
     * array are fulfilled.  To disable fulfillment of requested
     * side-effect Kubernetes deployment goals, set this to an empty
     * array.
     *
     * If this is not set and the `SDM_K8S_NAMESPACE` environment
     * variable is set, this is set to an array with the single
     * element of the `SDM_K8S_NAMESPACE` environment variable value.
     * This makes it easy to deploy, using the same spec, SDMs into
     * multiple namespaces that only mangage their namespace.  See
     * https://kubernetes.io/docs/tasks/inject-data-application/environment-variable-expose-pod-information/
     */
    namespaces?: string[];
}

/**
 * Register Kubernetes deployment support for provided goals.  Any
 * provided `options` are merged with any found in the SDM
 * configuration at `sdm.k8s.options`, or
 * `sdm.configuration.sdm.k8s.options` if accessing from the SDM
 * object, with those passed in taking precedence.
 *
 * @param options SDM Pack K8s options, see [[SdmPackK8sOptions]].
 * @returns SDM extension pack.
 */
export function k8sSupport(options: SdmPackK8sOptions = {}): ExtensionPack {
    return {
        ...metadata(),
        configure: sdm => {

            if (!sdm.configuration.sdm.k8s) {
                sdm.configuration.sdm.k8s = {};
            }
            if (!sdm.configuration.sdm.k8s.options) {
                sdm.configuration.sdm.k8s.options = {};
            }
            _.merge(sdm.configuration.sdm.k8s.options, options);

            if (sdm.configuration.sdm.k8s.options.addCommands) {
                sdm.addCommand(kubernetesUndeploy);
            }

            if (!sdm.configuration.sdm.k8s.options.namespaces && process.env.SDM_K8S_NAMESPACE) {
                sdm.configuration.sdm.k8s.options.namespaces = [process.env.SDM_K8S_NAMESPACE];
            }
            const namespaces: string[] = sdm.configuration.sdm.k8s.options.namespaces;
            if (namespaces === undefined || (namespaces && namespaces.length > 0)) {
                sdm.addEvent(kubernetesDeployHandler(sdm.name));
            }

            sdm.addStartupListener(minikubeStartupListener);

        },
    };
}
