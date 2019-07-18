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

import * as _ from "lodash";
import * as assert from "power-assert";
import { K8sObject } from "../../lib/kubernetes/api";
import {
    cleanKubernetesSpec,
    clusterResourceKinds,
    defaultKubernetesFetchOptions,
    defaultKubernetesResourceSelectorKinds,
    includedResourceKinds,
    includeMatch,
    K8sSelector,
    kubernetesResourceIdentity,
    KubernetesResourceSelector,
    namespaceResourceKinds,
    populateResourceSelectorDefaults,
    selectKubernetesResources,
    selectorMatch,
} from "../../lib/kubernetes/fetch";

/* tslint:disable:max-file-line-count */

describe("kubernetes/fetch", () => {

    describe("populateResourceSelectorDefaults", () => {

        it("should do nothing successfully", () => {
            const p = populateResourceSelectorDefaults([]);
            assert.deepStrictEqual(p, []);
        });

        it("should populate an empty object", () => {
            const s = [{}];
            const p = populateResourceSelectorDefaults(s);
            const e = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                        { apiVersion: "v1", kind: "PersistentVolume" },
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                        { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                    ],
                },
            ];
            assert.deepStrictEqual(p, e);
        });

        it("should keep the provided action", () => {
            const s: KubernetesResourceSelector[] = [{ action: "exclude" }];
            const p = populateResourceSelectorDefaults(s);
            const e = [
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                        { apiVersion: "v1", kind: "PersistentVolume" },
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                        { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                    ],
                },
            ];
            assert.deepStrictEqual(p, e);
        });

        it("should keep the provided kinds", () => {
            const s: KubernetesResourceSelector[] = [
                { kinds: [{ apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" }] },
            ];
            const p = populateResourceSelectorDefaults(s);
            const e = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                    ],
                },
            ];
            assert.deepStrictEqual(p, e);
        });

        it("should not add defaults if values already present", () => {
            const s: KubernetesResourceSelector[] = [
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                    ],
                },
            ];
            const p = populateResourceSelectorDefaults(s);
            const e = [
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                    ],
                },
            ];
            assert.deepStrictEqual(p, e);
        });

        it("should process multiple selectors", () => {
            const s: KubernetesResourceSelector[] = [
                {},
                { kinds: [{ apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" }] },
                { action: "exclude" },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                    ],
                },
            ];
            const p = populateResourceSelectorDefaults(s);
            const e = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                        { apiVersion: "v1", kind: "PersistentVolume" },
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                        { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                    ],
                },
                {
                    action: "include",
                    kinds: [{ apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" }],
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                        { apiVersion: "v1", kind: "PersistentVolume" },
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                        { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                    ],
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                    ],
                },
            ];
            assert.deepStrictEqual(p, e);
        });

    });

    describe("clusterResourcesKinds", () => {

        it("should return empty array if no cluster resources", () => {
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
            ];
            const c = clusterResourceKinds(s);
            assert.deepStrictEqual(c, []);
        });

        it("should return cluster resources from default", () => {
            const s: K8sSelector[] = [{ action: "include", kinds: defaultKubernetesResourceSelectorKinds }];
            const c = clusterResourceKinds(s);
            const e = [
                { apiVersion: "v1", kind: "PersistentVolume" },
                { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should deduplicate cluster resources", () => {
            const s: K8sSelector[] = [
                { action: "include", kinds: defaultKubernetesResourceSelectorKinds },
                { action: "include", kinds: defaultKubernetesResourceSelectorKinds },
                { action: "include", kinds: defaultKubernetesResourceSelectorKinds },
            ];
            const c = clusterResourceKinds(s);
            const e = [
                { apiVersion: "v1", kind: "PersistentVolume" },
                { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should return nothing from exclude", () => {
            const s: K8sSelector[] = [{ action: "exclude", kinds: defaultKubernetesResourceSelectorKinds }];
            const c = clusterResourceKinds(s);
            assert.deepStrictEqual(c, []);
        });

    });

    describe("includedResourceKinds", () => {

        it("should find nothing successfully", () => {
            const s = includedResourceKinds([]);
            assert.deepStrictEqual(s, []);
        });

        it("should return included resource kinds", () => {
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                },
            ];
            const c = includedResourceKinds(s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
                { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                { apiVersion: "apps/v1", kind: "DaemonSet" },
                { apiVersion: "apps/v1", kind: "Deployment" },
                { apiVersion: "apps/v1", kind: "StatefulSet" },
                { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                { apiVersion: "batch/v1beta1", kind: "CronJob" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should return included resource kinds and dedupe", () => {
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
            ];
            const c = includedResourceKinds(s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
                { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                { apiVersion: "apps/v1", kind: "DaemonSet" },
                { apiVersion: "apps/v1", kind: "Deployment" },
                { apiVersion: "apps/v1", kind: "StatefulSet" },
                { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                { apiVersion: "batch/v1beta1", kind: "CronJob" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should not include excluded resource kinds", () => {
            const s: K8sSelector[] = [
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                    ],
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                },
            ];
            const c = includedResourceKinds(s);
            assert.deepStrictEqual(c, []);
        });

        it("should return only included resource kinds and dedupe", () => {
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolume" },
                        { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                        { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolume" },
                        { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                        { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                    ],
                },
            ];
            const c = includedResourceKinds(s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
                { apiVersion: "v1", kind: "PersistentVolume" },
                { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
                { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
                { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                { apiVersion: "batch/v1beta1", kind: "CronJob" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
            ];
            assert.deepStrictEqual(c, e);
        });

    });

    describe("namespaceResourceKinds", () => {

        it("should find nothing successfully", () => {
            const n = "son-house";
            const s = namespaceResourceKinds(n, []);
            assert.deepStrictEqual(s, []);
        });

        it("should return include resource kinds with no namespace selector", () => {
            const n = "son-house";
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
            ];
            const c = namespaceResourceKinds(n, s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should return include resource kinds with string namespace selector", () => {
            const n = "son-house";
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                    namespace: "son-house",
                },
            ];
            const c = namespaceResourceKinds(n, s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should return include resource kinds with regular expression namespace selector", () => {
            const n = "son-house";
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                    namespace: /on-hous/,
                },
            ];
            const c = namespaceResourceKinds(n, s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should return nothing from exclude selectors", () => {
            const n = "son-house";
            const s: K8sSelector[] = [
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
            ];
            const c = namespaceResourceKinds(n, s);
            assert.deepStrictEqual(c, []);
        });

        it("should return included resource kinds and dedupe", () => {
            const n = "son-house";
            const s: K8sSelector[] = [
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                        { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                        { apiVersion: "apps/v1", kind: "DaemonSet" },
                        { apiVersion: "apps/v1", kind: "Deployment" },
                        { apiVersion: "apps/v1", kind: "StatefulSet" },
                    ],
                    namespace: "son-house",
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                        { apiVersion: "batch/v1beta1", kind: "CronJob" },
                        { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                    namespace: /houses?$/,
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                        { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
                    ],
                },
            ];
            const c = namespaceResourceKinds(n, s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
                { apiVersion: "v1", kind: "PersistentVolumeClaim" },
                { apiVersion: "extensions/v1beta1", kind: "Ingress" },
                { apiVersion: "apps/v1", kind: "DaemonSet" },
                { apiVersion: "apps/v1", kind: "Deployment" },
                { apiVersion: "apps/v1", kind: "StatefulSet" },
                { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
                { apiVersion: "batch/v1beta1", kind: "CronJob" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should include included that are also excluded", () => {
            const n = "son-house";
            const s: K8sSelector[] = [
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                },
                {
                    action: "include",
                    kinds: [
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "Service" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                    namespace: /(house|home)/,
                },
                {
                    action: "exclude",
                    kinds: [
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "ConfigMap" },
                        { apiVersion: "v1", kind: "Secret" },
                        { apiVersion: "v1", kind: "ServiceAccount" },
                    ],
                    namespace: "son-house",
                },
            ];
            const c = namespaceResourceKinds(n, s);
            const e = [
                { apiVersion: "v1", kind: "ConfigMap" },
                { apiVersion: "v1", kind: "Secret" },
                { apiVersion: "v1", kind: "Service" },
                { apiVersion: "v1", kind: "ServiceAccount" },
            ];
            assert.deepStrictEqual(c, e);
        });

    });

    describe("cleanKubernetesSpec", () => {

        it("should do nothing safely", () => {
            [undefined, {}].forEach((s: any) => {
                const c = cleanKubernetesSpec(s);
                assert(c === s);
            });
        });

        it("should remove unneeded properties", () => {
            const s: any = {
                apiVersion: "extensions/v1beta1",
                kind: "Deployment",
                metadata: {
                    annotations: {
                        "atomist.sha": "ee71cfb6eb63ee0ddc8875cb211074277b543d76",
                        "deployment.kubernetes.io/revision": "2008",
                        "kubectl.kubernetes.io/last-applied-configuration": "{}",
                    },
                    creationTimestamp: "2008-09-16T09:52:09Z",
                    generation: 13,
                    labels: {
                        "app.kubernetes.io/managed-by": "columbia",
                        "app.kubernetes.io/name": "the-way-i-see-it",
                        "app.kubernetes.io/part-of": "the-way-i-see-it",
                        "atomist.com/workspaceId": "APHA31",
                    },
                    name: "the-way-i-see-it",
                    namespace: "raphael-saadiq",
                    resourceVersion: "4207",
                    selfLink: "/apis/extensions/v1beta1/namespaces/raphael-saadiq/deployments/the-way-i-see-it",
                    uid: "31c06e3f-303e-11e9-b6a6-42010af001a7",
                },
                spec: {
                    progressDeadlineSeconds: 2147483647,
                    replicas: 2,
                    revisionHistoryLimit: 3,
                    selector: {
                        matchLabels: {
                            "app.kubernetes.io/name": "the-way-i-see-it",
                            "atomist.com/workspaceId": "APHA31",
                        },
                    },
                    strategy: {
                        rollingUpdate: {
                            maxSurge: 1,
                            maxUnavailable: 0,
                        },
                        type: "RollingUpdate",
                    },
                    template: {
                        metadata: {
                            creationTimestamp: undefined,
                            labels: {
                                "app.kubernetes.io/managed-by": "columbia",
                                "app.kubernetes.io/name": "the-way-i-see-it",
                                "app.kubernetes.io/part-of": "the-way-i-see-it",
                                "atomist.com/workspaceId": "APHA31",
                            },
                        },
                        spec: {
                            containers: [{
                                image: "raphaelsaadiq/the-way-i-see-it:2008",
                                name: "the-way-i-see-it",
                            }],
                        },
                    },
                },
                status: {
                    availableReplicas: 2,
                    conditions: [
                        {
                            lastTransitionTime: "2019-06-28T21:02:49Z",
                            lastUpdateTime: "2019-06-28T21:02:49Z",
                            message: "Deployment has minimum availability.",
                            reason: "MinimumReplicasAvailable",
                            status: "True",
                            type: "Available",
                        },
                    ],
                    observedGeneration: 13,
                    readyReplicas: 2,
                    replicas: 2,
                    updatedReplicas: 2,
                },
            };
            const c = cleanKubernetesSpec(s);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Deployment",
                metadata: {
                    annotations: {
                        "atomist.sha": "ee71cfb6eb63ee0ddc8875cb211074277b543d76",
                    },
                    labels: {
                        "app.kubernetes.io/managed-by": "columbia",
                        "app.kubernetes.io/name": "the-way-i-see-it",
                        "app.kubernetes.io/part-of": "the-way-i-see-it",
                        "atomist.com/workspaceId": "APHA31",
                    },
                    name: "the-way-i-see-it",
                    namespace: "raphael-saadiq",
                },
                spec: {
                    progressDeadlineSeconds: 2147483647,
                    replicas: 2,
                    revisionHistoryLimit: 3,
                    selector: {
                        matchLabels: {
                            "app.kubernetes.io/name": "the-way-i-see-it",
                            "atomist.com/workspaceId": "APHA31",
                        },
                    },
                    strategy: {
                        rollingUpdate: {
                            maxSurge: 1,
                            maxUnavailable: 0,
                        },
                        type: "RollingUpdate",
                    },
                    template: {
                        metadata: {
                            labels: {
                                "app.kubernetes.io/managed-by": "columbia",
                                "app.kubernetes.io/name": "the-way-i-see-it",
                                "app.kubernetes.io/part-of": "the-way-i-see-it",
                                "atomist.com/workspaceId": "APHA31",
                            },
                        },
                        spec: {
                            containers: [{
                                image: "raphaelsaadiq/the-way-i-see-it:2008",
                                name: "the-way-i-see-it",
                            }],
                        },
                    },
                },
            };
            assert.deepStrictEqual(c, e);
        });

        it("should remove empty annotations", () => {
            const s: any = {
                metadata: {
                    annotations: {
                        "deployment.kubernetes.io/revision": "2008",
                        "kubectl.kubernetes.io/last-applied-configuration": "{}",
                    },
                    name: "the-way-i-see-it",
                    namespace: "raphael-saadiq",
                },
            };
            const c = cleanKubernetesSpec(s);
            const e = {
                metadata: {
                    name: "the-way-i-see-it",
                    namespace: "raphael-saadiq",
                },
            };
            assert.deepStrictEqual(c, e);
        });

    });

    describe("kubernetesResourceIdentity", () => {

        it("should return all unique objects", () => {
            const o = [
                { apiVersion: "v1", kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset-mono", namespace: "something-else" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face-to-face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            const u = _.uniqBy(o, kubernetesResourceIdentity);
            const e = [
                { apiVersion: "v1", kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset-mono", namespace: "something-else" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face-to-face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            assert.deepStrictEqual(u, e);
        });

        it("should filter out duplicates", () => {
            const o = [
                { kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { apiVersion: "extensions/v1beta1", kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { apiVersion: "apps/v1", kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            const u = _.uniqBy(o, kubernetesResourceIdentity);
            const e = [
                { kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            assert.deepStrictEqual(u, e);
        });

    });

    describe("selectKubernetesResources", () => {

        it("should do nothing successfully", () => {
            const r: K8sObject[] = [];
            const s: K8sSelector[] = [];
            const o = selectKubernetesResources(r, s);
            assert.deepStrictEqual(o, []);
        });

        it("should return everything if no selectors", () => {
            const r: K8sObject[] = [
                { apiVersion: "v1", kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            const e = [
                { apiVersion: "v1", kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            [[], undefined].forEach(s => {
                const o = selectKubernetesResources(r, s);
                assert.deepStrictEqual(o, e);
            });
        });

        it("should filter resources using defaults", () => {
            const r: K8sObject[] = [
                { apiVersion: "v1", kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset-mono", namespace: "something-else" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "DaemonSet", metadata: { name: "kube-proxy", namespace: "kube-system" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face-to-face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "Service", metadata: { name: "kubernetes", namespace: "default" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            const s = populateResourceSelectorDefaults(defaultKubernetesFetchOptions.selectors);
            const o = selectKubernetesResources(r, s);
            const e = [
                { apiVersion: "v1", kind: "Secret", metadata: { name: "you-really-got-me", namespace: "kinks" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset", namespace: "something-else" } },
                { kind: "Deployment", metadata: { name: "waterloo-sunset-mono", namespace: "something-else" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face2face" } },
                { kind: "DaemonSet", metadata: { name: "sunny-afternoon", namespace: "face-to-face" } },
                { kind: "Service", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ServiceAccount", metadata: { name: "tired-of-waiting-for-you", namespace: "kinda-kinks" } },
                { kind: "ClusterRole", metadata: { name: "the-kinks-are-the-village-green-preservation-society" } },
            ];
            assert.deepStrictEqual(o, e);
        });

    });

    describe("selectorMatch", () => {

        it("should match when no name/label selectors", () => {
            const r: K8sObject = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "my-back-pages",
                    namespace: "byrds",
                },
            };
            const s: K8sSelector = {
                action: "include",
                kinds: [{ apiVersion: "v1", kind: "Service" }],
            };
            assert(selectorMatch(r, s));
        });

        it("should match on name selector", () => {
            const r: K8sObject = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "my-back-pages",
                    namespace: "byrds",
                },
            };
            const s: K8sSelector = {
                action: "include",
                kinds: [{ apiVersion: "v1", kind: "Service" }],
                name: "my-back-pages",
            };
            assert(selectorMatch(r, s));
        });

        it("should match on namespace selector", () => {
            const r: K8sObject = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "my-back-pages",
                    namespace: "byrds",
                },
            };
            const s: K8sSelector = {
                action: "include",
                kinds: [{ apiVersion: "v1", kind: "Service" }],
                namespace: /^b[iy]rds$/,
            };
            assert(selectorMatch(r, s));
        });

        it("should match on matchLabels selector", () => {
            const r: K8sObject = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    labels: {
                        album: "Younger Than Yesterday",
                        year: "1967",
                        recordLabel: "Columbia",
                    },
                    name: "my-back-pages",
                    namespace: "byrds",
                },
            };
            const s: K8sSelector = {
                action: "include",
                kinds: [{ apiVersion: "v1", kind: "Service" }],
                labelSelector: {
                    matchLabels: {
                        album: "Younger Than Yesterday",
                        year: "1967",
                    },
                },
            };
            assert(selectorMatch(r, s));
        });

    });

    describe("includeMatch", () => {

        it("should include a string", () => {
            const a = "include";
            const v = "sicilian-crest";
            const m = "sicilian-crest";
            assert(includeMatch(a, v, m));
        });

        it("should include a regular expression", () => {
            const a = "include";
            const v = "sicilian-crest";
            const m = /cilian-cr/;
            assert(includeMatch(a, v, m));
        });

        it("should not include a string", () => {
            const a = "include";
            const v = "sicilian-crest";
            const m = "sicilian-crust";
            assert(!includeMatch(a, v, m));
        });

        it("should not include a regular expression", () => {
            const a = "include";
            const v = "sicilian-crest";
            const m = /cilain-cr/;
            assert(!includeMatch(a, v, m));
        });

        it("should include when no matcher", () => {
            const a = "include";
            const v = "sicilian-crest";
            assert(includeMatch(a, v));
        });

        it("should exclude a string", () => {
            const a = "exclude";
            const v = "sicilian-crest";
            const m = "sicilian-crest";
            assert(!includeMatch(a, v, m));
        });

        it("should exclude a regular expression", () => {
            const a = "exclude";
            const v = "sicilian-crest";
            const m = /cilian-cr/;
            assert(!includeMatch(a, v, m));
        });

        it("should not exclude a string", () => {
            const a = "exclude";
            const v = "sicilian-crest";
            const m = "sicilian-crust";
            assert(includeMatch(a, v, m));
        });

        it("should not exclude a regular expression", () => {
            const a = "exclude";
            const v = "sicilian-crest";
            const m = /cilain-cr/;
            assert(includeMatch(a, v, m));
        });

        it("should exclude when no matcher", () => {
            const a = "exclude";
            const v = "sicilian-crest";
            assert(!includeMatch(a, v));
        });

        it("should throw an error when action is invalid", () => {
            const a: any = "enclude";
            const v = "sicilian-crest";
            const m = "sicilian-crest";
            assert.throws(() => includeMatch(a, v, m), /Provided action is neither 'include' or 'exclude': 'enclude'/);
        });

        it("should throw an error if matcher is neither a string nor regular expression", () => {
            const a = "include";
            const v = "sicilian-crest";
            const m: any = 2019;
            assert.throws(() => includeMatch(a, v, m), /Provided matcher is neither a string or RegExp: /);
        });

        it("should match an empty string", () => {
            const a = "include";
            const v = "";
            const m = "";
            assert(includeMatch(a, v, m));
        });

    });

});
