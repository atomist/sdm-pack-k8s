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

import { K8sObject } from "./api";
import { appMetadata } from "./metadata";
import { KubernetesDelete } from "./request";

/**
 * Create KubernetesObject from KubernetesApplication and kind.  This
 * method only supports the types of resources managed as part of a
 * KuberneteApplication, namely: Namespace, Secret, Service,
 * ServiceAccount, Deployment, Ingress, ClusterRole,
 * ClusterRoleBinding, Role, and RoleBinding.
 *
 * @param app Kubernetes application
 * @param kind kind of object to return
 * @return proper Kubernetes resource object
 */
export function appObject(app: KubernetesDelete, kind: string): K8sObject {
    const ko: K8sObject = {
        apiVersion: "v1",
        kind,
        metadata: appMetadata(app),
    };
    /* tslint:disable:no-switch-case-fall-through */
    switch (kind) {
        case "Namespace":
            ko.metadata = appMetadata(app, { ns: "namespace" });
        case "Secret":
        case "Service":
        case "ServiceAccount":
            break;
        case "Deployment":
            ko.apiVersion = "apps/v1";
            break;
        case "Ingress":
            ko.apiVersion = "extensions/v1beta1";
            break;
        case "ClusterRole":
        case "ClusterRoleBinding":
            ko.metadata = appMetadata(app, { ns: "cluster" });
        case "Role":
        case "RoleBinding":
            ko.apiVersion = "rbac.authorization.k8s.io/v1";
            break;
        default:
            throw new Error(`Unsupported kind of Kubernetes resource object: ${kind}`);
    }
    /* tslint:enable:no-switch-case-fall-through */
    return ko;
}

/**
 * Convert a full Kubernetes resource spec into a minimal KubernetesObject.
 *
 * @param spec Kubernetes spec to convert
 * @return Minimal Kubernetes object
 */
export function k8sObject(spec: K8sObject): K8sObject {
    const ko: K8sObject = {
        apiVersion: spec.apiVersion,
        kind: spec.kind,
        metadata: {
            name: spec.metadata.name,
            namespace: spec.metadata.namespace,
            labels: {
                "app.kubernetes.io/name": spec.metadata.labels["app.kubernetes.io/name"],
                "atomist.com/workspaceId": spec.metadata.labels["atomist.com/workspaceId"],
            },
        },
    };
    return ko;
}
