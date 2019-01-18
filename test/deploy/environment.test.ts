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
    IndependentOfEnvironment,
    ProductionEnvironment,
    ProjectDisposalEnvironment,
    SdmGoalEvent,
    StagingEnvironment,
} from "@atomist/sdm";
import * as assert from "power-assert";
import {
    defaultEnvironment,
    getEnvironmentLabel,
} from "../../lib/deploy/environment";
import { KubernetesDeploy } from "../../lib/deploy/goal";

describe("deploy/environment", () => {

    describe("defaultEnvironment", () => {

        it("should return the detail environment", () => {
            const g: SdmGoalEvent = { environment: "messiaen" } as any;
            const k: KubernetesDeploy = {
                details: { environment: "goehr" },
                environment: ProjectDisposalEnvironment,
                sdm: {
                    configuration: {
                        environment: "boulez",
                    },
                },
            } as any;
            const e = defaultEnvironment(g, k);
            assert(e === "goehr");
        });

        it("should return the event environment", () => {
            const g: SdmGoalEvent = { environment: "messiaen" } as any;
            const k: KubernetesDeploy = {
                environment: ProjectDisposalEnvironment,
                sdm: {
                    configuration: {
                        environment: "boulez",
                    },
                },
            } as any;
            const e = defaultEnvironment(g, k);
            assert(e === "messiaen");
        });

        it("should return the goal environment", () => {
            const g: SdmGoalEvent = {} as any;
            const k: KubernetesDeploy = {
                environment: ProjectDisposalEnvironment,
                sdm: {
                    configuration: {
                        environment: "boulez",
                    },
                },
            } as any;
            const e = defaultEnvironment(g, k);
            assert(e === "8-doom/");
        });

        it("should return the configuration environment", () => {
            const g: SdmGoalEvent = {} as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {
                        environment: "boulez",
                    },
                },
            } as any;
            const e = defaultEnvironment(g, k);
            assert(e === "boulez");
        });

        it("should return undefined if no environment available", () => {
            const g: SdmGoalEvent = {} as any;
            const k: KubernetesDeploy = {} as any;
            const e = defaultEnvironment(g, k);
            assert(e === undefined);
        });

    });

    describe("getEnvironmentLabel", () => {

        it("should handle a simple string", () => {
            const d = { environment: "messiaen" };
            const l = getEnvironmentLabel(d);
            assert(l === " to `messiaen`");
        });

        it("should handle production", () => {
            const d = { environment: ProductionEnvironment };
            const l = getEnvironmentLabel(d);
            assert(l === " to `production`");
        });

        it("should handle staging", () => {
            const d = { environment: StagingEnvironment };
            const l = getEnvironmentLabel(d);
            assert(l === " to `testing`");
        });

        it("should return nothing for independent", () => {
            const d = { environment: IndependentOfEnvironment };
            const l = getEnvironmentLabel(d);
            assert(l === "");
        });

        it("should return nothing for doom", () => {
            const d = { environment: ProjectDisposalEnvironment };
            const l = getEnvironmentLabel(d);
            assert(l === "");
        });

    });

});
