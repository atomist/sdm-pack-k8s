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

import * as assert from "power-assert";
import { isKubernetesApplication } from "../../lib/kubernetes/request";

describe("kubernetes/request", () => {

    describe("isKubernetesApplication", () => {

        it("should return false if all missing", () => {
            const o = {};
            assert(!isKubernetesApplication(o));
        });

        it("should return false if passed undefined", () => {
            assert(!isKubernetesApplication(undefined));
        });

        it("should return false if some missing", () => {
            const o = {
                name: "elliott",
                ns: "smith",
                image: "pictures-of-me:3.46",
            };
            assert(!isKubernetesApplication(o));
        });

        it("should return true if all present", () => {
            const o = {
                name: "elliott",
                ns: "smith",
                image: "pictures-of-me:3.46",
                workspaceId: "KRS",
            };
            assert(isKubernetesApplication(o));
        });

    });

});
