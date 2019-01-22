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

import * as assert from "power-assert";
import {
    clusterRoleBindingTemplate,
    clusterRoleTemplate,
    roleBindingTemplate,
    roleTemplate,
    serviceAccountTemplate,
    upsertRbac,
} from "../../lib/kubernetes/rbac";
import { KubernetesResourceRequest } from "../../lib/kubernetes/request";
import { pkgInfo } from "./pkg";

/* tslint:disable:max-file-line-count */

describe("kubernetes/rbac", () => {

    let pv: string;
    before(async () => {
        pv = await pkgInfo();
    });

    describe("upsertRbac", () => {

        it("should return nothing", async () => {
            const r: KubernetesResourceRequest = {} as any;
            const v = await upsertRbac(r);
            assert.deepStrictEqual(v, {});
        });

    });

    describe("roleTemplate", () => {

        it("should create a role spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {},
            };
            const s = await roleTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "Role",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                rules: [] as any,
            };
            assert.deepStrictEqual(s, e);
        });

        it("should merge in provided role spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                    },
                    rules: [
                        {
                            apiGroups: [""],
                            resources: ["services"],
                            verbs: ["get", "watch", "list"],
                        },
                        {
                            apiGroups: [""],
                            resources: ["pods"],
                            verbs: ["get", "watch", "list"],
                        },
                        {
                            apiGroups: ["extensions"],
                            resources: ["ingresses"],
                            verbs: ["get", "watch", "list"],
                        },
                        {
                            apiGroups: [""],
                            resources: ["nodes"],
                            verbs: ["list"],
                        },
                    ],
                },
            };
            const s = await roleTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "Role",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
                rules: [
                    {
                        apiGroups: [""],
                        resources: ["services"],
                        verbs: ["get", "watch", "list"],
                    },
                    {
                        apiGroups: [""],
                        resources: ["pods"],
                        verbs: ["get", "watch", "list"],
                    },
                    {
                        apiGroups: ["extensions"],
                        resources: ["ingresses"],
                        verbs: ["get", "watch", "list"],
                    },
                    {
                        apiGroups: [""],
                        resources: ["nodes"],
                        verbs: ["list"],
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("clusterRoleTemplate", () => {

        it("should create a cluster role spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: { kind: "ClusterRole" },
            };
            const s = await clusterRoleTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRole",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                rules: [] as any,
            };
            assert.deepStrictEqual(s, e);
        });

        it("should merge in provided role spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {
                    kind: "ClusterRole",
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                    },
                    rules: [
                        {
                            apiGroups: [""],
                            resources: ["services"],
                            verbs: ["get", "watch", "list"],
                        },
                        {
                            apiGroups: [""],
                            resources: ["pods"],
                            verbs: ["get", "watch", "list"],
                        },
                        {
                            apiGroups: ["extensions"],
                            resources: ["ingresses"],
                            verbs: ["get", "watch", "list"],
                        },
                        {
                            apiGroups: [""],
                            resources: ["nodes"],
                            verbs: ["list"],
                        },
                    ],
                },
            };
            const s = await clusterRoleTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRole",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
                rules: [
                    {
                        apiGroups: [""],
                        resources: ["services"],
                        verbs: ["get", "watch", "list"],
                    },
                    {
                        apiGroups: [""],
                        resources: ["pods"],
                        verbs: ["get", "watch", "list"],
                    },
                    {
                        apiGroups: ["extensions"],
                        resources: ["ingresses"],
                        verbs: ["get", "watch", "list"],
                    },
                    {
                        apiGroups: [""],
                        resources: ["nodes"],
                        verbs: ["list"],
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("serviceAccountTemplate", () => {

        it("should create a service account spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {},
            };
            const s = await serviceAccountTemplate(r);
            const e = {
                apiVersion: "v1",
                kind: "ServiceAccount",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
            };
            assert.deepStrictEqual(s, e);
        });

        it("should merge in provided service account spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                serviceAccountSpec: {
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                    },
                },
            };
            const s = await serviceAccountTemplate(r);
            const e = {
                apiVersion: "v1",
                kind: "ServiceAccount",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
            };
            assert.deepStrictEqual(s, e);
        });

        it("should use provided service account name", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                serviceAccountSpec: {
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                        name: "peter-gabriel",
                    },
                },
            };
            const s = await serviceAccountTemplate(r);
            const e = {
                apiVersion: "v1",
                kind: "ServiceAccount",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: "peter-gabriel",
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("roleBindingTemplate", () => {

        it("should create a role binding spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {},
            };
            const s = await roleBindingTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "RoleBinding",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "Role",
                    name: r.name,
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: r.name,
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

        it("should merge in provided role binding spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleBindingSpec: {
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                    },
                },
            };
            const s = await roleBindingTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "RoleBinding",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "Role",
                    name: r.name,
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: r.name,
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

        it("should create a role binding spec with provided service account", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {},
                serviceAccountSpec: {
                    metadata: {
                        name: "peter-gabriel",
                    },
                },
            };
            const s = await roleBindingTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "RoleBinding",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "Role",
                    name: r.name,
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: "peter-gabriel",
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("clusterRoleBindingTemplate", () => {

        it("should create a cluster role binding spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {},
            };
            const s = await clusterRoleBindingTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRoleBinding",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: r.name,
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: r.name,
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

        it("should merge in provided cluster role binding spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleBindingSpec: {
                    kind: "ClusterRoleBinding",
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                    },
                },
            };
            const s = await clusterRoleBindingTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRoleBinding",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: r.name,
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: r.name,
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

        it("should create a cluster role binding spec with provided service account", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                roleSpec: {},
                serviceAccountSpec: {
                    metadata: {
                        name: "peter-gabriel",
                    },
                },
            };
            const s = await clusterRoleBindingTemplate(r);
            const e = {
                apiVersion: "rbac.authorization.k8s.io/v1",
                kind: "ClusterRoleBinding",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                roleRef: {
                    apiGroup: "rbac.authorization.k8s.io",
                    kind: "ClusterRole",
                    name: r.name,
                },
                subjects: [
                    {
                        kind: "ServiceAccount",
                        name: "peter-gabriel",
                    },
                ],
            };
            assert.deepStrictEqual(s, e);
        });

    });

});
