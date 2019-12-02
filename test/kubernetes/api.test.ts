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

import { execPromise } from "@atomist/sdm";
import * as k8s from "@kubernetes/client-node";
import * as assert from "power-assert";
import {
    appendName,
    K8sObjectApi,
    namespaceRequired,
} from "../../lib/kubernetes/api";
import { applySpec } from "../../lib/kubernetes/apply";
import { loadKubeConfig } from "../../lib/kubernetes/config";
import { deleteSpec } from "../../lib/kubernetes/delete";
import { DefaultLogRetryOptions } from "../../lib/support/retry";
import {
    k8sAvailable,
    rng,
} from "../k8s";

describe("kubernetes/api", () => {

    describe("appendName", () => {

        it("should return append name", () => {
            ["delete", "patch", "read", "replace"].forEach((a: any) => {
                assert(appendName(a));
            });
        });

        it("should return not append name", () => {
            ["create", "list"].forEach((a: any) => {
                assert(!appendName(a));
            });
        });

    });

    describe("namespaceRequired", () => {

        it("should return namespace required", () => {
            const r: any = { namespaced: true };
            ["create", "delete", "patch", "read", "replace"].forEach((a: any) => {
                assert(namespaceRequired(r, a));
            });
        });

        it("should return namespace not required for list", () => {
            const r: any = { namespaced: true };
            assert(!namespaceRequired(r, "list"));
        });

        it("should return namespace not required", () => {
            const r: any = { namespaced: false };
            ["create", "delete", "list", "patch", "read", "replace"].forEach((a: any) => {
                assert(!namespaceRequired(r, a));
            });
        });

    });

    describe("integration", function(): void {

        // tslint:disable-next-line:no-invalid-this
        this.timeout(5000);

        let defaultRetries: number;
        before(async function(): Promise<void> {
            if (!await k8sAvailable()) {
                // tslint:disable-next-line:no-invalid-this
                this.skip();
            }
            defaultRetries = DefaultLogRetryOptions.retries;
            DefaultLogRetryOptions.retries = 0;
        });
        after(() => {
            if (defaultRetries) {
                DefaultLogRetryOptions.retries = defaultRetries;
            }
        });

        describe("K8sObjectApi.specUriPath", () => {

            let client: K8sObjectApi;
            before(function(): void {
                try {
                    const kc = loadKubeConfig();
                    client = kc.makeApiClient(K8sObjectApi);
                } catch (e) {
                    // tslint:disable-next-line:no-invalid-this
                    this.skip();
                }
            });

            it("should return a namespaced path", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        name: "repeater",
                        namespace: "fugazi",
                    },
                };
                const r = await client.specUriPath(o, "patch");
                assert(r === "api/v1/namespaces/fugazi/services/repeater");
            });

            it("should default to apiVersion v1", async () => {
                const o = {
                    kind: "ServiceAccount",
                    metadata: {
                        name: "repeater",
                        namespace: "fugazi",
                    },
                };
                const r = await client.specUriPath(o, "patch");
                assert(r === "api/v1/namespaces/fugazi/serviceaccounts/repeater");
            });

            it("should default to default namespace", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Pod",
                    metadata: {
                        name: "repeater",
                    },
                };
                const r = await client.specUriPath(o, "patch");
                assert(r === "api/v1/namespaces/default/pods/repeater");
            });

            it("should return a non-namespaced path", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Namespace",
                    metadata: {
                        name: "repeater",
                    },
                };
                const r = await client.specUriPath(o, "delete");
                assert(r === "api/v1/namespaces/repeater");
            });

            it("should return a namespaced path without name", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        namespace: "fugazi",
                    },
                };
                const r = await client.specUriPath(o, "list");
                assert(r === "api/v1/namespaces/fugazi/services");
            });

            it("should return a non-namespaced path without name", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Namespace",
                    metadata: {
                        name: "repeater",
                    },
                };
                const r = await client.specUriPath(o, "create");
                assert(r === "api/v1/namespaces");
            });

            it("should return a namespaced path for non-core resource", async () => {
                const o = {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "repeater",
                        namespace: "fugazi",
                    },
                };
                const r = await client.specUriPath(o, "read");
                assert(r === "apis/apps/v1/namespaces/fugazi/deployments/repeater");
            });

            it("should return properly pluralize", async () => {
                const o = {
                    apiVersion: "extensions/v1beta1",
                    kind: "Ingress",
                    metadata: {
                        name: "repeater",
                        namespace: "fugazi",
                    },
                };
                const r = await client.specUriPath(o, "delete");
                assert(r === "apis/extensions/v1beta1/namespaces/fugazi/ingresses/repeater");
            });

            it("should handle a variety of resources", async () => {
                /* tslint:disable:max-line-length */
                const a = [
                    { apiVersion: "v1", kind: "Service", ns: true, e: "api/v1/namespaces/fugazi/services/repeater" },
                    { apiVersion: "v1", kind: "ServiceAccount", ns: true, e: "api/v1/namespaces/fugazi/serviceaccounts/repeater" },
                    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", ns: true, e: "apis/rbac.authorization.k8s.io/v1/namespaces/fugazi/roles/repeater" },
                    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", ns: false, e: "apis/rbac.authorization.k8s.io/v1/clusterroles/repeater" },
                    { apiVersion: "extensions/v1beta1", kind: "NetworkPolicy", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/networkpolicies/repeater" },
                    { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", ns: true, e: "apis/networking.k8s.io/v1/namespaces/fugazi/networkpolicies/repeater" },
                    { apiVersion: "extensions/v1beta1", kind: "Ingress", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/ingresses/repeater" },
                    { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/daemonsets/repeater" },
                    { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/daemonsets/repeater" },
                    { apiVersion: "apps/v1", kind: "DaemonSet", ns: true, e: "apis/apps/v1/namespaces/fugazi/daemonsets/repeater" },
                    { apiVersion: "extensions/v1beta1", kind: "Deployment", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/deployments/repeater" },
                    { apiVersion: "apps/v1", kind: "Deployment", ns: true, e: "apis/apps/v1/namespaces/fugazi/deployments/repeater" },
                    { apiVersion: "storage.k8s.io/v1", kind: "StorageClass", ns: false, e: "apis/storage.k8s.io/v1/storageclasses/repeater" },
                ];
                /* tslint:enable:max-line-length */
                for (const k of a) {
                    const o: k8s.KubernetesObject = {
                        apiVersion: k.apiVersion,
                        kind: k.kind,
                        metadata: {
                            name: "repeater",
                        },
                    };
                    if (k.ns) {
                        o.metadata.namespace = "fugazi";
                    }
                    const r = await client.specUriPath(o, "patch");
                    assert(r === k.e);
                }
            });

            it("should handle a variety of resources without names", async () => {
                /* tslint:disable:max-line-length */
                const a = [
                    { apiVersion: "v1", kind: "Service", ns: true, e: "api/v1/namespaces/fugazi/services" },
                    { apiVersion: "v1", kind: "ServiceAccount", ns: true, e: "api/v1/namespaces/fugazi/serviceaccounts" },
                    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", ns: true, e: "apis/rbac.authorization.k8s.io/v1/namespaces/fugazi/roles" },
                    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole", ns: false, e: "apis/rbac.authorization.k8s.io/v1/clusterroles" },
                    { apiVersion: "extensions/v1beta1", kind: "NetworkPolicy", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/networkpolicies" },
                    { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", ns: true, e: "apis/networking.k8s.io/v1/namespaces/fugazi/networkpolicies" },
                    { apiVersion: "extensions/v1beta1", kind: "Ingress", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/ingresses" },
                    { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/daemonsets" },
                    { apiVersion: "extensions/v1beta1", kind: "DaemonSet", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/daemonsets" },
                    { apiVersion: "apps/v1", kind: "DaemonSet", ns: true, e: "apis/apps/v1/namespaces/fugazi/daemonsets" },
                    { apiVersion: "extensions/v1beta1", kind: "Deployment", ns: true, e: "apis/extensions/v1beta1/namespaces/fugazi/deployments" },
                    { apiVersion: "apps/v1", kind: "Deployment", ns: true, e: "apis/apps/v1/namespaces/fugazi/deployments" },
                    { apiVersion: "storage.k8s.io/v1", kind: "StorageClass", ns: false, e: "apis/storage.k8s.io/v1/storageclasses" },
                ];
                /* tslint:enable:max-line-length */
                for (const k of a) {
                    const o: k8s.KubernetesObject = {
                        apiVersion: k.apiVersion,
                        kind: k.kind,
                    };
                    if (k.ns) {
                        o.metadata = { namespace: "fugazi" };
                    }
                    const r = await client.specUriPath(o, "list");
                    assert(r === k.e);
                }
            });

            it("should throw an error if kind missing", async () => {
                const o = {
                    apiVersion: "v1",
                    metadata: {
                        name: "repeater",
                        namespace: "fugazi",
                    },
                };
                try {
                    await client.specUriPath(o, "create");
                    assert.fail("should have thrown error");
                } catch (e) {
                    assert(/Spec does not contain kind:/.test(e.message));
                }
            });

            it("should throw an error if name required and missing", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        namespace: "fugazi",
                    },
                };
                try {
                    await client.specUriPath(o, "read");
                    assert.fail("should have thrown error");
                } catch (e) {
                    assert(/Spec does not contain name:/.test(e.message));
                }
            });

            it("should throw an error if resource is not valid", async () => {
                const o = {
                    apiVersion: "v1",
                    kind: "Ingress",
                    metadata: {
                        name: "repeater",
                        namespace: "fugazi",
                    },
                };
                try {
                    await client.specUriPath(o, "create");
                    assert.fail("should have thrown error");
                } catch (e) {
                    assert(e.message === "Unrecognized API version and kind: v1 Ingress");
                }
            });

        });

        describe("apply & delete", () => {

            it("should apply and delete resources", async () => {
                const s = {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        name: `sdm-pack-k8s-api-int-${rng()}`,
                        namespace: "default",
                    },
                    spec: {
                        ports: [
                            {
                                port: 80,
                                protocol: "TCP",
                                targetPort: 80,
                            },
                        ],
                        selector: {
                            app: "sleep",
                        },
                    },
                };
                const d = {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: `sdm-pack-k8s-api-int-${rng()}`,
                        namespace: "default",
                    },
                    spec: {
                        selector: {
                            matchLabels: {
                                app: "sleep",
                            },
                        },
                        template: {
                            metadata: {
                                labels: {
                                    app: "sleep",
                                },
                            },
                            spec: {
                                containers: [
                                    {
                                        args: ["60"],
                                        command: ["sleep"],
                                        image: "alpine",
                                        name: "sleep",
                                        ports: [{ containerPort: 80 }],
                                    },
                                ],
                            },
                        },
                    },
                };
                await applySpec(s);
                await applySpec(d);
                const s0 = await execPromise("kubectl", ["get", "-n", s.metadata.namespace, "services"]);
                assert(s0.stdout.includes(s.metadata.name));
                const d0 = await execPromise("kubectl", ["get", "-n", d.metadata.namespace, "deployments"]);
                assert(d0.stdout.includes(d.metadata.name));
                await applySpec(s);
                await applySpec(d);
                const s1 = await execPromise("kubectl", ["get", "-n", s.metadata.namespace, "services"]);
                assert(s1.stdout.includes(s.metadata.name));
                const d1 = await execPromise("kubectl", ["get", "-n", d.metadata.namespace, "deployments"]);
                assert(d1.stdout.includes(d.metadata.name));
                await deleteSpec(d);
                await deleteSpec(s);
                const dl = await execPromise("kubectl", ["get", "-n", d.metadata.namespace, "deployments"]);
                assert(!dl.stdout.includes(d.metadata.name));
                const sl = await execPromise("kubectl", ["get", "-n", d.metadata.namespace, "services"]);
                assert(!sl.stdout.includes(s.metadata.name));
            });

            it("should throw a proper error", async () => {
                const s = {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        name: `_not_a_valid_name_`,
                        namespace: "default",
                    },
                    spec: {
                        ports: [
                            {
                                port: 80,
                                protocol: "TCP",
                                targetPort: 80,
                            },
                        ],
                        selector: {
                            app: "sleep",
                        },
                    },
                };
                let thrown = false;
                try {
                    await applySpec(s);
                } catch (e) {
                    thrown = true;
                    assert(/Service "_not_a_valid_name_" is invalid: metadata.name: Invalid value: "_not_a_valid_name_":/.test(e.message));
                }
                assert(thrown, "error not thrown");
                const d = {
                    apiVersion: "applications/v1",
                    kind: "Deployment",
                    metadata: {
                        name: `sdm-pack-k8s-api-int-${rng()}`,
                        namespace: "default",
                    },
                    spec: {
                        selector: {
                            matchLabels: {
                                app: "sleep",
                            },
                        },
                        template: {
                            metadata: {
                                labels: {
                                    app: "sleep",
                                },
                            },
                            spec: {
                                containers: [
                                    {
                                        args: ["60"],
                                        command: ["sleep"],
                                        image: "alpine",
                                        name: "sleep",
                                        ports: [{ containerPort: 80 }],
                                    },
                                ],
                            },
                        },
                    },
                };
                thrown = false;
                try {
                    await applySpec(d);
                } catch (e) {
                    thrown = true;
                    assert(e.message === "Unrecognized API version and kind: applications/v1 Deployment");
                }
                assert(thrown, "error not thrown");
            });

        });

    });

});
