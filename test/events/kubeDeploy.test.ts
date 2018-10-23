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

import { Success } from "@atomist/automation-client";
import { SdmGoalEvent } from "@atomist/sdm";

import {
    CommitForSdmGoal,
    eligibleDeployGoal,
    KubeDeployParameters,
    validateSdmGoal,
} from "../../lib/events/kubeDeploy";

describe("kubeDeploy", () => {

    describe("eligibleDeployGoal", () => {

        const c: CommitForSdmGoal = {
            image: {
                imageName: "bowie/life-on-mars:19.7.1",
            },
        };

        it("should reject a goal with no fulfillment", () => {
            const g: SdmGoalEvent = {
                state: "requested",
            } as any;
            const r = eligibleDeployGoal(g, c);
            assert(r.code !== 0);
            assert(r.message.startsWith("SDM goal contains no fulfillment"));
        });

        it("should reject a goal not for k8-automation", () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "Quicksand",
                    method: "side-effect",
                },
                state: "requested",
            } as any;
            const r = eligibleDeployGoal(g, c);
            assert(r.code !== 0);
            assert(r.message.startsWith("SDM goal fulfillment name 'Quicksand' is not"));
        });

        it("should reject a goal with non-side-effect fulfillment", () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@atomist/k8-automation",
                    method: "other",
                },
                state: "requested",
            } as any;
            const r = eligibleDeployGoal(g, c);
            assert(r.code !== 0);
            assert(r.message.startsWith("SDM goal fulfillment method 'other' is not"));
        });

        it("should reject a goal with non-side-effect fulfillment", () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@atomist/k8-automation",
                    method: "side-effect",
                },
                state: "skipped",
            } as any;
            const r = eligibleDeployGoal(g, c);
            assert(r.code !== 0);
            assert(r.message === "SDM goal state 'skipped' is not 'requested'");
        });

        it("should reject a goal with non-side-effect fulfillment", () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@atomist/k8-automation",
                    method: "side-effect",
                },
                state: "requested",
            } as any;
            const r = eligibleDeployGoal(g, c);
            assert.deepStrictEqual(r, Success);
        });

    });

    describe("validateSdmGoal", () => {

        it("should validate when no mode or namespaces are supplied", () => {
            const kd = {
                environment: "stardust",
            } as any as KubeDeployParameters;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g, kd);
            assert.deepStrictEqual(ka, d.kubernetes);
        });

        it("should validate in cluster mode with no namespaces", () => {
            const kd = {
                environment: "stardust",
                mode: "cluster",
            } as any as KubeDeployParameters;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g, kd);
            assert.deepStrictEqual(ka, d.kubernetes);
        });

        it("should validate in cluster mode with namespaces", () => {
            const kd = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggy", "band"],
            } as any as KubeDeployParameters;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g, kd);
            assert.deepStrictEqual(ka, d.kubernetes);
        });

        it("should return undefined if ns not in namespaces", () => {
            const kd = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggys-band"],
            } as any as KubeDeployParameters;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g, kd);
            assert(ka === undefined);
        });

        it("should validate in namespace mode", () => {
            const kd = {
                environment: "stardust",
                mode: "namespace",
            } as any as KubeDeployParameters;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ns = process.env.POD_NAMESPACE;
            process.env.POD_NAMESPACE = "ziggy";
            const ka = validateSdmGoal(g, kd);
            if (ns) {
                process.env.POD_NAMESPACE = ns;
            } else {
                delete process.env.POD_NAMESPACE;
            }
            assert.deepStrictEqual(ka, d.kubernetes);
        });

        it("should return undefined if ns not POD_NAMESPACE", () => {
            const kd: KubeDeployParameters = {
                environment: "stardust",
                mode: "namespace",
            } as any;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ns = process.env.POD_NAMESPACE;
            process.env.POD_NAMESPACE = "not-ziggy";
            const ka = validateSdmGoal(g, kd);
            if (ns) {
                process.env.POD_NAMESPACE = ns;
            } else {
                delete process.env.POD_NAMESPACE;
            }
            assert(ka === undefined);
        });

        it("should throw an error if no data", () => {
            const kd: KubeDeployParameters = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggys-band"],
            } as any;
            const g: SdmGoalEvent = {} as any;
            assert.throws(() => validateSdmGoal(g, kd), /SDM goal data property is false, cannot deploy:/);
        });

        it("should throw an error if data does not parse", () => {
            const kd: KubeDeployParameters = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggys-band"],
            } as any;
            const g: SdmGoalEvent = { data: "{not valid json]" } as any;
            assert.throws(() => validateSdmGoal(g, kd), /Failed to parse SDM goal data/);
        });

        it("should throw an error if no kubernetes data", () => {
            const kd: KubeDeployParameters = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggys-band"],
            } as any;
            const g: SdmGoalEvent = { data: "{}" } as any;
            assert.throws(() => validateSdmGoal(g, kd),
                /SDM goal data kubernetes property is false, cannot deploy:/);
        });

        it("should throw an error if no app name", () => {
            const kd: KubeDeployParameters = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggys-band"],
            } as any;
            const d = {
                kubernetes: {
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            assert.throws(() => validateSdmGoal(g, kd),
                /SDM goal data kubernetes name property is false, cannot deploy:/);
        });

        it("should throw an error if namespace not available in namespace mode", () => {
            const kd: KubeDeployParameters = {
                environment: "stardust",
                mode: "namespace",
            } as any;
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ns = process.env.POD_NAMESPACE;
            if (ns) {
                delete process.env.POD_NAMESPACE;
            }
            assert.throws(() => validateSdmGoal(g, kd),
                // tslint:disable-next-line:max-line-length
                /Kubernetes deploy requested but k8-automation is running in namespace-scoped mode and the POD_NAMESPACE environment variable is not set/);
            if (ns) {
                process.env.POD_NAMESPACE = ns;
            }
        });

    });

});
