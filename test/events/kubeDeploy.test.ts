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
    SdmGoalEvent,
} from "@atomist/sdm";
import {
    eligibleDeployGoal,
    KubernetesDeployParameters,
    verifyKubernetesApplicationDeploy,
} from "../../lib/events/kubeDeploy";
import {
    KubernetesApplicationOptions,
} from "../../lib/support/options";
import {
    defaultNamespace,
} from "../../lib/typings/kubernetes";

describe("kubeDeploy", () => {

    describe("eligibleDeployGoal", () => {

        it("should reject a goal with no fulfillment", async () => {
            const g: SdmGoalEvent = {
                state: "requested",
            } as any;
            const r = await eligibleDeployGoal(g);
            assert(r === false);
        });

        it("should reject a goal not for someone else", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "Quicksand",
                    method: "side-effect",
                },
                state: "requested",
            } as any;
            const r = await eligibleDeployGoal(g);
            assert(r === false);
        });

        it("should reject a goal with non-side-effect fulfillment", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@atomist/sdm-pack-k8",
                    method: "other",
                },
                state: "requested",
            } as any;
            const r = await eligibleDeployGoal(g);
            assert(r === false);
        });

        it("should reject a goal with non-requested state", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@atomist/sdm-pack-k8",
                    method: "side-effect",
                },
                state: "skipped",
            } as any;
            const r = await eligibleDeployGoal(g);
            assert(r === false);
        });

        it("should accept a goal side-effect fulfillment for this package", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@atomist/sdm-pack-k8",
                    method: "side-effect",
                },
                state: "requested",
            } as any;
            const r = await eligibleDeployGoal(g);
            assert(r === true);
        });

    });

    describe("verifyKubeApplication", () => {

        it("should validate when no deployment is supplied", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kv = verifyKubernetesApplicationDeploy(ka, undefined);
            assert.deepStrictEqual(kv, ka);
        });

        it("should populate the default namespace if none provided", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
            };
            const kv = verifyKubernetesApplicationDeploy(ka, undefined);
            assert(kv.name === ka.name);
            assert(kv.environment === ka.environment);
            assert(kv.ns === defaultNamespace);
        });

        it("should validate when no environment, mode, or namespaces are supplied", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd = new KubernetesDeployParameters();
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should validate when no mode or namespaces are supplied", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd = new KubernetesDeployParameters();
            kd.environment = "stardust";
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should validate in cluster mode with no namespaces", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd = new KubernetesDeployParameters();
            kd.environment = "stardust";
            kd.mode = "cluster";
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should validate in cluster mode with namespaces", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployParameters = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggy", "band"],
            };
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should return undefined if ns not in namespaces", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployParameters = {
                environment: "stardust",
                mode: "cluster",
                namespaces: ["left-hand", "made-it-too-far", "special-man", "ziggys-band"],
            };
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert(kv === undefined);
        });

        it("should validate in namespace mode", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployParameters = {
                environment: "stardust",
                mode: "namespace",
                namespaces: undefined,
            };
            const ns = process.env.POD_NAMESPACE;
            process.env.POD_NAMESPACE = "ziggy";
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            if (ns) {
                process.env.POD_NAMESPACE = ns;
            } else {
                delete process.env.POD_NAMESPACE;
            }
            assert.deepStrictEqual(kv, ka);
        });

        it("should return undefined if ns not POD_NAMESPACE", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployParameters = {
                environment: "stardust",
                mode: "namespace",
                namespaces: undefined,
            };
            const ns = process.env.POD_NAMESPACE;
            process.env.POD_NAMESPACE = "not-ziggy";
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            if (ns) {
                process.env.POD_NAMESPACE = ns;
            } else {
                delete process.env.POD_NAMESPACE;
            }
            assert(kv === undefined);
        });

        it("should throw an error if namespace not available in namespace mode", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployParameters = {
                environment: "stardust",
                mode: "namespace",
                namespaces: undefined,
            };
            const ns = process.env.POD_NAMESPACE;
            if (ns) {
                delete process.env.POD_NAMESPACE;
            }
            assert.throws(() => verifyKubernetesApplicationDeploy(ka, kd),
                // tslint:disable-next-line:max-line-length
                /Kubernetes deploy requested but k8-automation is running in namespace-scoped mode and the POD_NAMESPACE environment variable is not set/);
            if (ns) {
                process.env.POD_NAMESPACE = ns;
            }
        });

    });

});
