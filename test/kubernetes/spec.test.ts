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

import * as assert from "power-assert";
import {
    kubernetesSpecFileBasename,
    kubernetesSpecStringify,
} from "../../lib/kubernetes/spec";

describe("kubernetes/spec", () => {

    describe("kubernetesSpecFileBasename", () => {

        it("should create a namespace file name", () => {
            const o = {
                apiVersion: "v1",
                kind: "Namespace",
                metadata: {
                    name: "lyle",
                },
            };
            const s = kubernetesSpecFileBasename(o);
            assert(s === "10_lyle_namespace");
        });

        it("should create a simple namespaced file name", () => {
            [
                { a: "apps/v1", k: "Deployment", p: "70" },
                { a: "extensions/v1beta1", k: "Ingress", p: "80" },
                { a: "rbac.authorization.k8s.io/v1", k: "Role", p: "25" },
                { a: "v1", k: "Secret", p: "60" },
                { a: "v1", k: "Service", p: "50" },
            ].forEach(r => {
                const o = {
                    apiVersion: r.a,
                    kind: r.k,
                    metadata: {
                        name: "lyle",
                        namespace: "lovett",
                    },
                };
                const s = kubernetesSpecFileBasename(o);
                const e = r.p + "_lovett_lyle_" + r.k.toLowerCase();
                assert(s === e);
            });
        });

        it("should create a kebab-case namespaced file name", () => {
            [
                { a: "v1", k: "ServiceAccount", l: "service-account", p: "20" },
                { a: "rbac.authorization.k8s.io/v1", k: "RoleBinding", l: "role-binding", p: "30" },
                { a: "apps/v1", k: "DaemonSet", l: "daemon-set", p: "70" },
                { a: "networking.k8s.io/v1", k: "NetworkPolicy", l: "network-policy", p: "40" },
                { a: "v1", k: "PersistentVolumeClaim", l: "persistent-volume-claim", p: "40" },
                { a: "extensions/v1beta1", k: "PodSecurityPolicy", l: "pod-security-policy", p: "40" },
                { a: "policy/v1beta1", k: "HorizontalPodAutoscaler", l: "horizontal-pod-autoscaler", p: "80" },
                { a: "policy/v1beta1", k: "PodDisruptionBudget", l: "pod-disruption-budget", p: "80" },
            ].forEach(r => {
                const o = {
                    apiVersion: r.a,
                    kind: r.k,
                    metadata: {
                        name: "lyle",
                        namespace: "lovett",
                    },
                };
                const s = kubernetesSpecFileBasename(o);
                const e = r.p + "_lovett_lyle_" + r.l;
                assert(s === e);
            });
        });

        it("should create a kebab-case cluster file name", () => {
            [
                { a: "v1", k: "PersistentVolume", l: "persistent-volume", p: "15" },
                { a: "storage.k8s.io/v1", k: "StorageClass", l: "storage-class", p: "15" },
                { a: "rbac.authorization.k8s.io/v1", k: "ClusterRole", l: "cluster-role", p: "25" },
                { a: "rbac.authorization.k8s.io/v1", k: "ClusterRoleBinding", l: "cluster-role-binding", p: "30" },
            ].forEach(r => {
                const o = {
                    apiVersion: r.a,
                    kind: r.k,
                    metadata: {
                        name: "lyle",
                    },
                };
                const s = kubernetesSpecFileBasename(o);
                const e = r.p + "_lyle_" + r.l;
                assert(s === e);
            });
        });

    });

    describe("kubernetesSpecStringify", () => {

        it("should stringify a spec", async () => {
            const r = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "kubernetes",
                    namespace: "default",
                    labels: {
                        component: "apiserver",
                        provider: "kubernetes",
                    },
                },
                spec: {
                    type: "ClusterIP",
                    ports: [
                        {
                            name: "https",
                            protocol: "TCP",
                            port: 443,
                            targetPort: 8443,
                        },
                    ],
                    sessionAffinity: "None",
                    clusterIP: "10.96.0.1",
                },
            };
            const s = await kubernetesSpecStringify(r);
            const e = `{
  "apiVersion": "v1",
  "kind": "Service",
  "metadata": {
    "labels": {
      "component": "apiserver",
      "provider": "kubernetes"
    },
    "name": "kubernetes",
    "namespace": "default"
  },
  "spec": {
    "clusterIP": "10.96.0.1",
    "ports": [
      {
        "name": "https",
        "port": 443,
        "protocol": "TCP",
        "targetPort": 8443
      }
    ],
    "sessionAffinity": "None",
    "type": "ClusterIP"
  }
}
`;
            assert(s === e);
        });

        it("should stringify a spec to yaml", async () => {
            const r = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "kubernetes",
                    namespace: "default",
                    labels: {
                        component: "apiserver",
                        provider: "kubernetes",
                    },
                },
                spec: {
                    type: "ClusterIP",
                    ports: [
                        {
                            name: "https",
                            protocol: "TCP",
                            port: 443,
                            targetPort: 8443,
                        },
                    ],
                    sessionAffinity: "None",
                    clusterIP: "10.96.0.1",
                },
            };
            const s = await kubernetesSpecStringify(r, { format: "yaml" });
            const e = `apiVersion: v1
kind: Service
metadata:
  labels:
    component: apiserver
    provider: kubernetes
  name: kubernetes
  namespace: default
spec:
  clusterIP: 10.96.0.1
  ports:
    - name: https
      port: 443
      protocol: TCP
      targetPort: 8443
  sessionAffinity: None
  type: ClusterIP
`;
            assert(s === e);
        });

        it("should encrypt secret values", async () => {
            const r = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    name: "butterfly",
                    namespace: "the-hollies",
                },
                data: {
                    year: "MTk2Nw==",
                    studio: "QWJiZXkgUm9hZCBTdHVkaW9z",
                    producer: "Um9uIFJpY2hhcmRz",
                },
            };
            const k = "Dear Eloise / King Midas in Reverse";
            const s = await kubernetesSpecStringify(r, { secretKey: k });
            const e = `{
  "apiVersion": "v1",
  "data": {
    "producer": "fIXYFs7jyC5iLxbeC3iGuYdgMhA/hxHaX80SocbXKX4=",
    "studio": "CC4ZtaHs9d3f5uZ9FoTAuLGel2mTG+Wmj6iOdssUoi4=",
    "year": "gqOPJs0mmn7vj7PMjQl7Hg=="
  },
  "kind": "Secret",
  "metadata": {
    "name": "butterfly",
    "namespace": "the-hollies"
  },
  "type": "Opaque"
}
`;
            assert(s === e);
        });

    });

});
