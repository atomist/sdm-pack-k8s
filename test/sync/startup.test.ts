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
import * as assert from "power-assert";
import { sortSpecs } from "../../lib/sync/startup";

describe("sync/startup", () => {

    describe("sortSpecs", () => {

        it("should sort nothing successfully", async () => {
            const r: GitProject = InMemoryProject.of() as any;
            const s = await sortSpecs(r);
            assert.deepStrictEqual(s, []);
        });

        it("should sort specs successfully", async () => {
            const r: GitProject = InMemoryProject.of(
                { path: "80-b-deployment.json", content: "{}" },
                { path: "60-c-service.json", content: "{}" },
                { path: "60-d-service.json", content: "{}" },
                { path: "80-a-deployment.yaml", content: "kind: Deployment\n" },
                { path: "00-x-daemonset.json", content: "{}" },
                { path: "50-z-ingress.yml", content: "" },
            ) as any;
            const s = await sortSpecs(r);
            assert(s.length === 6);
            assert(s[0].name === "00-x-daemonset.json");
            assert(s[1].name === "50-z-ingress.yml");
            assert(s[2].name === "60-c-service.json");
            assert(s[3].name === "60-d-service.json");
            assert(s[4].name === "80-a-deployment.yaml");
            assert(s[5].name === "80-b-deployment.json");
        });

        it("should exclude non-spec files", async () => {
            const r: GitProject = InMemoryProject.of(
                { path: "README.md", content: "# Project\n" },
                { path: "80-b-deployment.json", content: "{}" },
                { path: "60-c-service.json", content: "{}" },
                { path: "index.ts", content: "" },
                { path: "60-d-service.json", content: "{}" },
                { path: "80-a-deployment.yaml", content: "kind: Deployment\n" },
                { path: "lib/stuff.ts", content: "" },
                { path: "00-x-daemonset.json", content: "{}" },
                { path: "50-z-ingress.yml", content: "" },
                { path: "test/stuff.test.ts", content: "" },
            ) as any;
            const s = await sortSpecs(r);
            assert(s.length === 6);
            assert(s[0].name === "00-x-daemonset.json");
            assert(s[1].name === "50-z-ingress.yml");
            assert(s[2].name === "60-c-service.json");
            assert(s[3].name === "60-d-service.json");
            assert(s[4].name === "80-a-deployment.yaml");
            assert(s[5].name === "80-b-deployment.json");
        });

    });

});
