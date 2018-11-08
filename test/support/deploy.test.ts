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
    validateSdmGoal,
} from "../../lib/support/deploy";

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

});
