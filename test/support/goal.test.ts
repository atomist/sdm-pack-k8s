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

import {
    GitProject,
    InMemoryProject,
} from "@atomist/automation-client";
import {
    SdmGoalEvent,
} from "@atomist/sdm";
import * as assert from "power-assert";
import {
    createKubernetesData,
    readKubernetesSpec,
} from "../../lib/support/goal";
import {
    KubernetesApplicationOptions,
} from "../../lib/support/options";

describe("goalSetup", () => {

    describe("readKubernetesSpec", () => {

        it("should not find a spec successfully", async () => {
            const p = InMemoryProject.of();
            const s = await readKubernetesSpec(p, "drake.json");
            assert(s === undefined);
        });

        it("should not find the wrong spec", async () => {
            const p = InMemoryProject.of({ path: ".atomist/kubernetes/nick.json", content: "{}\n" });
            const s = await readKubernetesSpec(p, "drake.json");
            assert(s === undefined);
        });

        it("should find the spec", async () => {
            const p = InMemoryProject.of({ path: ".atomist/kubernetes/nick.json", content: "{}\n" });
            const s = await readKubernetesSpec(p, "nick.json");
            assert(s === "{}\n");
        });

        it("should find the right spec", async () => {
            const p = InMemoryProject.of(
                { path: ".atomist/kubernetes/nick.json", content: "{}\n" },
                { path: ".atomist/kubernetes/drake.json", content: `{"which":"will"}\n` },
            );
            const s = await readKubernetesSpec(p, "drake.json");
            assert(s === `{"which":"will"}\n`);
        });

    });

    describe("createKubernetesData", () => {

        it("should create simple kubernetes data", async () => {
            const g: SdmGoalEvent = {} as any;
            const p: GitProject = InMemoryProject.of() as any;
            const o: KubernetesApplicationOptions = {} as any;
            const d = await createKubernetesData(g, o, p);
            const e = {
                data: "{\"kubernetes\":{}}",
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create kubernetes data", async () => {
            const g: SdmGoalEvent = {} as any;
            const p: GitProject = InMemoryProject.of() as any;
            const o: KubernetesApplicationOptions = {
                name: "nick",
                environment: "pink-moon",
            };
            const d = await createKubernetesData(g, o, p);
            const e = {
                data: JSON.stringify({
                    kubernetes: o,
                }),
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create kubernetes data with specs", async () => {
            const g: SdmGoalEvent = {} as any;
            const p: GitProject = InMemoryProject.of(
                { path: ".atomist/kubernetes/deployment.json", content: `{"kind":"Deployment"}\n` },
                { path: ".atomist/kubernetes/service.json", content: `{"kind":"Service"}\n` },
            ) as any;
            const o: KubernetesApplicationOptions = {
                name: "nick",
                environment: "pink-moon",
                port: 8080,
            };
            const d = await createKubernetesData(g, o, p);
            const e = {
                data: JSON.stringify({
                    kubernetes: {
                        name: "nick",
                        environment: "pink-moon",
                        port: 8080,
                        deploymentSpec: `{"kind":"Deployment"}\n`,
                        serviceSpec: `{"kind":"Service"}\n`,
                    },
                }),
            };
            assert.deepStrictEqual(d, e);
        });

    });

});
