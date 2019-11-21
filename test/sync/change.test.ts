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
import * as assert from "power-assert";
import {
    calculateChanges,
    changeResource,
    previousSpecVersion,
} from "../../lib/sync/change";
import { PushDiff } from "../../lib/sync/diff";

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
            const fileContents = await previousSpecVersion("", "", "");
            assert.equal(fileContents, "");
        });
    });

    describe("changeResources", () => {

        it("resource file does not exist", async () => {
            const project: GitProject = InMemoryProject.of() as any;
            const change: PushDiff = {
                change: "apply",
                path: "fake.path",
                sha: "fake.sha",

            };

            try {
                await changeResource(project, change);
                assert.fail("should not", "get here");
            } catch (e) {
                assert.equal(e.message, "Resource spec file 'fake.path' does not exist in project");
            }
        });
    });
});
