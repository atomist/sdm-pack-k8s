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
import * as sdm from "@atomist/sdm";
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

        describe("delete changes",  () => {

            let origClientDelete: any;
            let origClientRead: any;
            let origPreviousSpecVersion: any;

            before(() => {
                origClientDelete = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "delete");
                Object.defineProperty(api.K8sObjectApi.prototype, "delete", {
                    value: async (spec: api.K8sObject, body: any) => {
                        return Promise.resolve();
                    },
                });

                origClientRead = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "read");
                Object.defineProperty(api.K8sObjectApi.prototype, "read", {
                    value: async (spec: api.K8sObject) => {
                        return Promise.resolve();
                    },
                });

                origPreviousSpecVersion = Object.getOwnPropertyDescriptor(prv, "previousSpecVersion");
                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(resource);
                    },
                });
            });

            after(() => {
                Object.defineProperty(api.K8sObjectApi.prototype, "delete", origClientDelete);
                Object.defineProperty(api.K8sObjectApi.prototype, "read", origClientRead);
                Object.defineProperty(prv, "previousSpecVersion", origPreviousSpecVersion);
            });

            it("test", async () => {
                const project: GitProject = InMemoryProject.of() as any;
                const diff: PushDiff = {
                    change: "delete",
                    path: "fake.path",
                    sha: "fake.sha",
                };

                await changeResource(project, diff);
            });
        });

        describe("apply changes", () => {
            let origClientPatch: any;
            let origClientRead: any;
            let origPreviousSpecVersion: any;

            before(() => {

                origClientPatch = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "patch");
                Object.defineProperty(api.K8sObjectApi.prototype, "patch", {
                    value: async (spec: api.K8sObject) => {
                        return Promise.resolve();
                    },
                });

                origClientRead = Object.getOwnPropertyDescriptor(api.K8sObjectApi.prototype, "read");
                Object.defineProperty(api.K8sObjectApi.prototype, "read", {
                    value: async (spec: api.K8sObject) => {
                        return Promise.resolve();
                    },
                });

                origPreviousSpecVersion = Object.getOwnPropertyDescriptor(prv, "previousSpecVersion");
                Object.defineProperty(prv, "previousSpecVersion", {
                    value: (baseDir: string, specPath: string, sha: string) => {
                        return yaml.safeDump(resource);
                    },
                });
            });

            after(() => {
                Object.defineProperty(api.K8sObjectApi.prototype, "patch", origClientPatch);
                Object.defineProperty(api.K8sObjectApi.prototype, "read", origClientRead);
                Object.defineProperty(prv, "previousSpecVersion", origPreviousSpecVersion);
            });

            it("test", async () => {

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
        });

    });
});
