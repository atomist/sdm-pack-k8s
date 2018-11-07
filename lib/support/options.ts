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

/**
 * Subset of KubeApplication properties, omitting those that are
 * typically gotten from the context, build, or project.  Since some
 * of these properties are optional here an not in KubeApplication,
 * this is defined as a entirely different object rather than using
 * `Pick<>`.  See the [[KubeApplication]] documentation for property
 * documentation.
 */
export interface KubernetesApplicationOptions {
    environment: string;
    name: string;

    ns?: string;
    imagePullSecret?: string;
    port?: number;
    path?: string;
    host?: string;
    protocol?: "http" | "https";
    tlsSecret?: string;
    replicas?: number;
}

/**
 * Previous name of KubernetesApplicationOptions.
 * @deprecated use KubernetesApplicationOptions
 */
export type KubernetesDeploymentOptions = KubernetesApplicationOptions;
