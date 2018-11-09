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
    KubernetesDeployCoreOptions,
    KubernetesDeployMode,
    validateSdmGoal,
    verifyKubernetesApplicationDeploy,
} from "../../lib/support/deploy";
import {
    KubernetesApplicationOptions,
} from "../../lib/support/options";
import {
    defaultNamespace,
} from "../../lib/typings/kubernetes";

describe("deploy", () => {

    describe("validateSdmGoal", () => {

        it("should validate SDM goal with Kubernetes data", () => {
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g);
            assert.deepStrictEqual(ka, d.kubernetes);
        });

        it("should validate SDM goal with minimal Kubernetes data", () => {
            const d = {
                kubernetes: {
                    name: "spiders-from-mars",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g);
            assert.deepStrictEqual(ka, d.kubernetes);
        });

        it("should not validate SDM goal without data", () => {
            const g: SdmGoalEvent = {} as any;
            const ka = validateSdmGoal(g);
            assert(ka === undefined);
        });

        it("should not validate SDM goal with invalid data", () => {
            const g: SdmGoalEvent = { data: "]}not valid JSON{[" } as any;
            const ka = validateSdmGoal(g);
            assert(ka === undefined);
        });

        it("should not validate SDM goal without Kubernetes data", () => {
            const d = {
                notKubernetes: {
                    name: "spiders-from-mars",
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g);
            assert(ka === undefined);
        });

        it("should not validate SDM goal without Kubernetes name", () => {
            const d = {
                kubernetes: {
                    environment: "stardust",
                    ns: "ziggy",
                },
            };
            const g: SdmGoalEvent = { data: JSON.stringify(d) } as any;
            const ka = validateSdmGoal(g);
            assert(ka === undefined);
        });

    });

    describe("verifyKubernetesApplicationDeploy", () => {

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
            const kd: KubernetesDeployCoreOptions = {} as any;
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should validate when no mode or namespaces are supplied", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
            };
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should validate in cluster mode with no namespaces", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
                mode: KubernetesDeployMode.Cluster,
            };
            const kv = verifyKubernetesApplicationDeploy(ka, kd);
            assert.deepStrictEqual(kv, ka);
        });

        it("should validate in cluster mode with namespaces", () => {
            const ka: KubernetesApplicationOptions = {
                name: "spiders-from-mars",
                environment: "stardust",
                ns: "ziggy",
            };
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
                mode: KubernetesDeployMode.Cluster,
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
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
                mode: KubernetesDeployMode.Cluster,
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
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
                mode: KubernetesDeployMode.Namespace,
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
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
                mode: KubernetesDeployMode.Namespace,
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
            const kd: KubernetesDeployCoreOptions = {
                environment: "stardust",
                mode: KubernetesDeployMode.Namespace,
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
