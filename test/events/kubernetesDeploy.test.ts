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

import { SdmGoalEvent } from "@atomist/sdm";
import * as assert from "power-assert";
import {
    eligibleDeployGoal,
    KubernetesDeployParameters,
    verifyKubernetesApplicationDeploy,
} from "../../lib/events/kubernetesDeploy";
import { KubernetesApplication } from "../../lib/kubernetes/request";

describe("events/kubernetesDeploy", () => {

    describe("eligibleDeployGoal", () => {

        it("should reject a goal with no fulfillment", async () => {
            const g: SdmGoalEvent = {
                state: "requested",
            } as any;
            const p = {
                name: "@bowie/spiders-from-mars",
                environment: "stardust",
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should reject a goal for someone else", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "Quicksand",
                    method: "side-effect",
                },
                state: "requested",
            } as any;
            const p = {
                name: "@bowie/spiders-from-mars",
                environment: "stardust",
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should reject a goal with non-side-effect fulfillment", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@bowie/spiders-from-mars",
                    method: "other",
                },
                state: "requested",
            } as any;
            const p = {
                name: "@bowie/spiders-from-mars",
                environment: "stardust",
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should reject a goal with non-requested state", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@bowie/spiders-from-mars",
                    method: "side-effect",
                },
                state: "skipped",
            } as any;
            const p = {
                name: "@bowie/spiders-from-mars",
                environment: "stardust",
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should accept a goal side-effect fulfillment with same name", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@bowie/spiders-from-mars",
                    method: "side-effect",
                },
                state: "requested",
            } as any;
            const p = {
                name: "@bowie/spiders-from-mars",
                environment: "stardust",
            };
            assert(await eligibleDeployGoal(g, p));
        });

    });

    describe("verifyKubernetesApplicationDeploy", () => {

        it("should validate when environment matches and no namespaces", () => {
            const a: KubernetesApplication = {
                environment: "stardust",
                image: "ziggys/fans:3.13",
                name: "spiders-from-mars",
                ns: "ziggy",
                workspaceId: "B0W13",
            };
            const p: KubernetesDeployParameters = {
                name: "@bowie/spiders-from-mars",
                environment: "stardust",
            };
            assert(verifyKubernetesApplicationDeploy(a, p));
        });

        it("should validate when environment and namespaces match", () => {
            const a: KubernetesApplication = {
                environment: "stardust",
                image: "ziggys/fans:3.13",
                name: "spiders-from-mars",
                ns: "ziggy",
                workspaceId: "B0W13",
            };
            const p: KubernetesDeployParameters = {
                environment: "stardust",
                name: "@bowie/spiders-from-mars",
                namespaces: ["five-years", "soul-love", "moonage-daydream", "ziggy", "starman"],
            };
            assert(verifyKubernetesApplicationDeploy(a, p));
        });

        it("should not validate when environment does not match and namespaces do", () => {
            const a: KubernetesApplication = {
                environment: "suffragette-city",
                image: "ziggys/fans:3.13",
                name: "spiders-from-mars",
                ns: "ziggy",
                workspaceId: "B0W13",
            };
            const p: KubernetesDeployParameters = {
                environment: "stardust",
                name: "@bowie/spiders-from-mars",
                namespaces: ["five-years", "soul-love", "moonage-daydream", "ziggy", "starman"],
            };
            assert(!verifyKubernetesApplicationDeploy(a, p));
        });

        it("should not validate when environment matches and namespaces do not", () => {
            const a: KubernetesApplication = {
                environment: "stardust",
                image: "ziggys/fans:3.13",
                name: "spiders-from-mars",
                ns: "ziggy",
                workspaceId: "B0W13",
            };
            const p: KubernetesDeployParameters = {
                environment: "stardust",
                name: "@bowie/spiders-from-mars",
                namespaces: ["five-years", "soul-love", "moonage-daydream", "starman"],
            };
            assert(!verifyKubernetesApplicationDeploy(a, p));
        });

        it("should not validate when namespaces empty", () => {
            const a: KubernetesApplication = {
                environment: "stardust",
                image: "ziggys/fans:3.13",
                name: "spiders-from-mars",
                ns: "ziggy",
                workspaceId: "B0W13",
            };
            const p: KubernetesDeployParameters = {
                environment: "stardust",
                name: "@bowie/spiders-from-mars",
                namespaces: [],
            };
            assert(!verifyKubernetesApplicationDeploy(a, p));
        });

    });

});
