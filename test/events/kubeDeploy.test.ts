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
} from "../../lib/events/kubeDeploy";

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

});
