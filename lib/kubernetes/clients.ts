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

import * as k8s from "@kubernetes/client-node";

/**
 * Kubernetes API clients used to create/update/delete application
 * resources.
 */
export interface KubernetesClients {
    /** Kubernetes Core client */
    core: k8s.Core_v1Api;
    /** Kubernetes Apps client */
    apps: k8s.Apps_v1Api;
    /** Kubernetes Extension client */
    ext: k8s.Extensions_v1beta1Api;
    /** Kubernetes RBAC client */
    rbac: k8s.RbacAuthorization_v1Api;
}

/**
 * Create the KubernetesClients structure.
 */
export function makeApiClients(kc: k8s.KubeConfig): KubernetesClients {
    const core = kc.makeApiClient(k8s.Core_v1Api);
    const apps = kc.makeApiClient(k8s.Apps_v1Api); // GA in Kubernetes 1.9
    const rbac = kc.makeApiClient(k8s.RbacAuthorization_v1Api); // GA in Kubernetes 1.8
    const ext = kc.makeApiClient(k8s.Extensions_v1beta1Api);
    return { core, apps, rbac, ext };
}
