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

import { SdmGoalEvent } from "@atomist/sdm";
import * as assert from "power-assert";
import {
    eligibleDeployGoal,
    KubernetesDeployParameters,
} from "../../lib/events/kubernetesDeploy";

describe("events/kubernetesDeploy", () => {

    describe("eligibleDeployGoal", () => {

        it("should reject a goal with no fulfillment", async () => {
            const g: SdmGoalEvent = {
                state: "in_process",
            } as any;
            const p: KubernetesDeployParameters = {
                configuration: {
                    name: "@bowie/spiders-from-mars",
                    environment: "stardust",
                } as any,
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should reject a goal for someone else", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "Quicksand",
                },
                state: "in_process",
            } as any;
            const p: KubernetesDeployParameters = {
                configuration: {
                    name: "@bowie/spiders-from-mars",
                    environment: "stardust",
                } as any,
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should reject a goal with non-in_process state", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@bowie/spiders-from-mars",
                },
                state: "skipped",
            } as any;
            const p: KubernetesDeployParameters = {
                configuration: {
                    name: "@bowie/spiders-from-mars",
                    environment: "stardust",
                } as any,
            };
            assert(!await eligibleDeployGoal(g, p));
        });

        it("should accept a goal fulfillment with same name", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@bowie/spiders-from-mars",
                },
                state: "in_process",
            } as any;
            const p: KubernetesDeployParameters = {
                configuration: {
                    name: "@bowie/spiders-from-mars",
                    environment: "stardust",
                } as any,
            };
            assert(await eligibleDeployGoal(g, p));
        });

        it("should accept a goal fulfillment when no environment", async () => {
            const g: SdmGoalEvent = {
                fulfillment: {
                    name: "@bowie/spiders-from-mars",
                },
                state: "in_process",
            } as any;
            const p: KubernetesDeployParameters = {
                configuration: {
                    name: "@bowie/spiders-from-mars",
                } as any,
            };
            assert(await eligibleDeployGoal(g, p));
        });

    });

});
