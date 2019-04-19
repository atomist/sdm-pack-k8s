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

import * as k8s from "@kubernetes/client-node";
import * as assert from "power-assert";
import { specUriPath } from "../../lib/kubernetes/api";

describe("kubernetes/api", () => {

    describe("specPath", () => {

        it("should return a namespaced path", () => {
            const o: k8s.KubernetesObject = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            } as any;
            const r = specUriPath(o);
            assert(r === "v1/namespaces/fugazi/services/repeater");
        });

        it("should return a non-namespaced path", () => {
            const o: k8s.KubernetesObject = {
                apiVersion: "v1",
                kind: "Namespace",
                metadata: {
                    name: "repeater",
                },
            } as any;
            const r = specUriPath(o);
            assert(r === "v1/namespaces/repeater");
        });

        it("should return a namespaced path for non-core resource", () => {
            const o: k8s.KubernetesObject = {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            } as any;
            const r = specUriPath(o);
            assert(r === "apps/v1/namespaces/fugazi/deployments/repeater");
        });

        it("should return properly pluralize", () => {
            const o: k8s.KubernetesObject = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    name: "repeater",
                    namespace: "fugazi",
                },
            } as any;
            const r = specUriPath(o);
            assert(r === "extensions/v1beta1/namespaces/fugazi/ingresses/repeater");
        });

        it("should handle a variety of resources", () => {
            /* tslint:disable:max-line-length */
            const a = [
                { apiVersion: "v1", kind: "Service", ns: true, e: "v1/namespaces/fugazi/services/repeater" },
                { apiVersion: "v1", kind: "ServiceAccount", ns: true, e: "v1/namespaces/fugazi/serviceaccounts/repeater" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", ns: true, e: "rbac.authorization.k8s.io/v1/namespaces/fugazi/roles/repeater" },
                { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", ns: false, e: "rbac.authorization.k8s.io/v1/clusterroles/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "NetworkPolicy", ns: true, e: "extensions/v1beta1/namespaces/fugazi/networkpolicies/repeater" },
                { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", ns: true, e: "networking.k8s.io/v1/namespaces/fugazi/networkpolicies/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "Ingress", ns: true, e: "extensions/v1beta1/namespaces/fugazi/ingresses/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "extensions/v1beta1/namespaces/fugazi/daemonsets/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "extensions/v1beta1/namespaces/fugazi/daemonsets/repeater" },
                { apiVersion: "apps/v1", kind: "DaemonSet", ns: true, e: "apps/v1/namespaces/fugazi/daemonsets/repeater" },
                { apiVersion: "extensions/v1beta1", kind: "Deployment", ns: true, e: "extensions/v1beta1/namespaces/fugazi/deployments/repeater" },
                { apiVersion: "apps/v1", kind: "Deployment", ns: true, e: "apps/v1/namespaces/fugazi/deployments/repeater" },
                { apiVersion: "storage.k8s.io/v1", kind: "StorageClass", ns: false, e: "storage.k8s.io/v1/storageclasses/repeater" },
            ];
            /* tslint:enable:max-line-length */
            a.forEach(k => {
                const o: k8s.KubernetesObject = {
                    apiVersion: k.apiVersion,
                    kind: k.kind,
                    metadata: {
                        name: "repeater",
                    },
                } as any;
                if (k.ns) {
                    o.metadata.namespace = "fugazi";
                }
                const r = (specUriPath(o));
                assert(r === k.e);
            });
        });

    });

});
