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
    GitProject,
    InMemoryProject,
} from "@atomist/automation-client";
import * as acglobals from "@atomist/automation-client/lib/globals";
import * as sdm from "@atomist/sdm";
import * as k8s from "@kubernetes/client-node";
import * as yaml from "js-yaml";
import * as assert from "power-assert";
import * as api from "../../lib/kubernetes/api";
import {
    calculateChanges,
    changeResource,
} from "../../lib/sync/change";
import { PushDiff } from "../../lib/sync/diff";
import * as prv from "../../lib/sync/previousSpecVersion";

describe("sync/change", () => {

    let originalAutomationClient: any;
    before(() => {
        originalAutomationClient = Object.getOwnPropertyDescriptor(acglobals, "automationClientInstance");
        Object.defineProperty(acglobals, "automationClientInstance", {
            value: () => ({
                configuration: {
                    name: "@joe-henry/scar",
                },
            }),
        });
    });
    after(() => {
        Object.defineProperty(acglobals, "automationClientInstance", originalAutomationClient);
    });

    describe("calculateChanges", () => {

        it("should delete everything", () => {
            const b = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
            ];
            const c = calculateChanges(b, undefined, "delete");
            const e = [
                { change: "delete", spec: { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "delete", spec: { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "delete", spec: { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } } },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("should apply everything", () => {
            const a = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
            ];
            [
                undefined,
                [],
                [
                    { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                    { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                    { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
                ],
            ].forEach(b => {
                const c = calculateChanges(b, a, "apply");
                const e = [
                    { change: "apply", spec: { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } } },
                    { change: "apply", spec: { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } } },
                    { change: "apply", spec: { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } } },
                ];
                assert.deepStrictEqual(c, e);
            });
        });

        it("should apply after and delete befores not in after", () => {
            const a = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
            ];
            const b = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Deployment", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
            ];
            const c = calculateChanges(b, a, "apply");
            const e = [
                { change: "apply", spec: { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "apply", spec: { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "apply", spec: { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "delete", spec: { kind: "Deployment", metadata: { name: "emmylou", namespace: "harris" } } },
            ];
            assert.deepStrictEqual(c, e);
        });

    });

    describe("previousSpecVersion", () => {

        let originalExecPromise: any;
        before(() => {
            originalExecPromise = Object.getOwnPropertyDescriptor(sdm, "execPromise");
            Object.defineProperty(sdm, "execPromise", {
                value: async () => {
                    throw new Error("git show failure");
                },
            });
        });

        after(() => {
            Object.defineProperty(sdm, "execPromise", originalExecPromise);
        });

        it("git show throws on delete", async () => {
            const fileContents = await prv.previousSpecVersion("", "", "");
            assert.equal(fileContents, "");
        });
    });

    describe("changeResources", () => {

        it("resource file does not exist", async () => {
            const project: GitProject = InMemoryProject.of() as any;
            const diff: PushDiff = {
                change: "apply",
                path: "fake.path",
                sha: "fake.sha",
            };

            try {
                await changeResource(project, diff);
                assert.fail("should not", "get here");
            } catch (e) {
                assert.equal(e.message, "Resource spec file 'fake.path' does not exist in project");
            }
        });

        describe("spoofs", () => {
            const resource = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    name: "mysecret",
                },
                data: {
                    username: "dGhlIHJvb3RtaW5pc3RyYXRvcg==",
                    password: "Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==",
                },
            };

            let origClientDelete: any;
            let origClientPatch: any;
            let origClientRead: any;
            let origPreviousSpecVersion: any;

            before(() => {
                origClientDelete = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "delete");
                origClientPatch = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "patch");

                origClientRead = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "read");
                Object.defineProperty(api.K8sObjectApi.prototype, "read", {
                    value: async (spec: k8s.KubernetesObject) => {
                        return Promise.resolve();
                    },
                });

                origPreviousSpecVersion = Object.getOwnPropertyDescriptor(prv, "previousSpecVersion");
            });

            after(() => {
                Object.defineProperty(api.K8sObjectApi.prototype, "delete", origClientDelete);
                Object.defineProperty(api.K8sObjectApi.prototype, "patch", origClientPatch);
                Object.defineProperty(api.K8sObjectApi.prototype, "read", origClientRead);
                Object.defineProperty(prv, "previousSpecVersion", origPreviousSpecVersion);
            });

            it("delete changes", async () => {
                Object.defineProperty(api.K8sObjectApi.prototype, "delete", {
                    value: async (spec: k8s.KubernetesObject, body: any) => {
                        return Promise.resolve();
                    },
                });
                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(resource);
                    },
                });

                const project: GitProject = InMemoryProject.of() as any;
                const diff: PushDiff = {
                    change: "delete",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });

            it("apply changes", async () => {
                Object.defineProperty(api.K8sObjectApi.prototype, "patch", {
                    value: async (spec: k8s.KubernetesObject) => {
                        return Promise.resolve();
                    },
                });
                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(resource);
                    },
                });

                const project: GitProject = InMemoryProject.of({
                    path: "fake.path",
                    content: yaml.safeDump(resource),
                }) as any;
                const diff: PushDiff = {
                    change: "apply",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });

            /**
             * expect that the patch and delete methods are not called
             */
            it("apply changes with ignore annotation", async () => {
                const r = {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "mysecret",
                        annotations: {
                            "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore",
                        },
                    },
                    data: {
                        username: "dGhlIHJvb3RtaW5pc3RyYXRvcg==",
                        password: "Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==",
                    },
                };

                Object.defineProperty(api.K8sObjectApi.prototype, "patch", {
                    value: async (spec: k8s.KubernetesObject) => {
                        throw new Error("patch shouldn't be called");
                    },
                });

                Object.defineProperty(api.K8sObjectApi.prototype, "delete", {
                    value: async (spec: k8s.KubernetesObject, body: any) => {
                        throw new Error("delete shouldn't be called");
                    },
                });
                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(r);
                    },
                });

                const project: GitProject = InMemoryProject.of({
                    path: "fake.path",
                    content: yaml.safeDump(r),
                }) as any;
                const diff: PushDiff = {
                    change: "apply",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });

            /**
             * expect that the delete method is not called
             */
            it("apply changes with ignore annotation and different sdm name", async () => {
                const r = {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "mysecret",
                        annotations: {
                            "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore",
                        },
                    },
                    data: {
                        username: "dGhlIHJvb3RtaW5pc3RyYXRvcg==",
                        password: "Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==",
                    },
                };

                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(r);
                    },
                });
                Object.defineProperty(api.K8sObjectApi.prototype, "patch", {
                    value: async (spec: k8s.KubernetesObject) => {
                        return Promise.resolve();
                    },
                });

                Object.defineProperty(api.K8sObjectApi.prototype, "delete", {
                    value: async (spec: k8s.KubernetesObject, body: any) => {
                        return Promise.reject(new Error("patch shouldn't be called"));
                    },
                });

                const project: GitProject = InMemoryProject.of({
                    path: "fake.path",
                    content: yaml.safeDump(r),
                }) as any;
                const diff: PushDiff = {
                    change: "apply",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });

            /**
             * expect that the patch and delete methods are not called
             */
            it("delete changes with ignore annotation", async () => {
                const r = {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "mysecret",
                        annotations: {
                            "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore",
                        },
                    },
                    data: {
                        username: "dGhlIHJvb3RtaW5pc3RyYXRvcg==",
                        password: "Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==",
                    },
                };

                Object.defineProperty(api.K8sObjectApi.prototype, "patch", {
                    value: async (spec: k8s.KubernetesObject) => {
                        throw new Error("patch shouldn't be called");
                    },
                });

                Object.defineProperty(api.K8sObjectApi.prototype, "delete", {
                    value: async (spec: k8s.KubernetesObject, body: any) => {
                        throw new Error("delete shouldn't be called");
                    },
                });
                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(r);
                    },
                });

                const project: GitProject = InMemoryProject.of({
                    path: "fake.path",
                    content: yaml.safeDump(r),
                }) as any;
                const diff: PushDiff = {
                    change: "delete",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });

            /**
             * expect that the patch method is not called
             */
            it("delete changes with ignore annotation and different sdm name", async () => {
                const r = {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "mysecret",
                        annotations: {
                            "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore",
                        },
                    },
                    data: {
                        username: "dGhlIHJvb3RtaW5pc3RyYXRvcg==",
                        password: "Y29ycmVjdCBob3JzZSBiYXR0ZXJ5IHN0YXBsZQ==",
                    },
                };

                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(r);
                    },
                });
                Object.defineProperty(api.K8sObjectApi.prototype, "patch", {
                    value: async (spec: k8s.KubernetesObject) => {
                        return Promise.reject(new Error("patch shouldn't be called"));
                    },
                });

                Object.defineProperty(api.K8sObjectApi.prototype, "delete", {
                    value: async (spec: k8s.KubernetesObject, body: any) => {
                        return Promise.resolve();
                    },
                });

                const project: GitProject = InMemoryProject.of({
                    path: "fake.path",
                    content: yaml.safeDump(r),
                }) as any;
                const diff: PushDiff = {
                    change: "delete",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });

        });
    });

    describe("sdm-pack-k8s annotation", () => {

        it("ignore annotation value is present", () => {

            const a = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
                {
                    kind: "ConfigMap", metadata: {
                        name: "louemmy", namespace: "sirrah",
                        annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore" },
                    },
                },
            ];
            const b = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Deployment", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
                {
                    kind: "ConfigMap", metadata: {
                        name: "emmylou", namespace: "harris",
                        annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore" },
                    },
                },
                {
                    kind: "ConfigMap", metadata: {
                        name: "louemmy", namespace: "sirrah",
                        annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore" },
                    },
                },
            ];
            const c = calculateChanges(b, a, "apply");
            const e = [
                { change: "apply", spec: { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "apply", spec: { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "apply", spec: { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "delete", spec: { kind: "Deployment", metadata: { name: "emmylou", namespace: "harris" } } },
                {
                    change: "ignore", spec: {
                        kind: "ConfigMap", metadata: {
                            name: "emmylou", namespace: "harris",
                            annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore" },
                        },
                    },
                },
                {
                    change: "ignore", spec: {
                        kind: "ConfigMap", metadata: {
                            name: "louemmy", namespace: "sirrah",
                            annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/scar": "ignore" },
                        },
                    },
                },
            ];
            assert.deepStrictEqual(c, e);
        });

        it("sdm name is not recognised", () => {

            const a = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
                {
                    kind: "ConfigMap", metadata: {
                        name: "louemmy", namespace: "sirrah",
                        annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore" },
                    },
                },
            ];
            const b = [
                { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Deployment", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } },
                { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } },
                {
                    kind: "ConfigMap", metadata: {
                        name: "emmylou", namespace: "harris",
                        annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore" },
                    },
                },
                {
                    kind: "ConfigMap", metadata: {
                        name: "louemmy", namespace: "sirrah",
                        annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore" },
                    },
                },
            ];
            const c = calculateChanges(b, a, "apply");
            const e = [
                { change: "apply", spec: { kind: "Service", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "apply", spec: { kind: "Secret", metadata: { name: "emmylou", namespace: "harris" } } },
                { change: "apply", spec: { kind: "Role", metadata: { name: "emmylou", namespace: "harris" } } },
                {
                    change: "apply", spec: {
                        kind: "ConfigMap", metadata: {
                            name: "louemmy", namespace: "sirrah",
                            annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore" },
                        },
                    },
                },
                { change: "delete", spec: { kind: "Deployment", metadata: { name: "emmylou", namespace: "harris" } } },
                {
                    change: "delete", spec: {
                        kind: "ConfigMap", metadata: {
                            name: "emmylou", namespace: "harris",
                            annotations: { "atomist.com/sdm-pack-k8s/@joe-henry/with-no-scar": "ignore" },
                        },
                    },
                },
            ];
            assert.deepStrictEqual(c, e);
        });
    });
});
