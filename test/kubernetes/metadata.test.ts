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

import * as k8s from "@kubernetes/client-node";
import * as assert from "power-assert";
import { metadataTemplate } from "../../lib/kubernetes/metadata";

describe("kubernetes/metadata", () => {

    describe("metadataTemplate", () => {

        it("should return empty metadata", () => {
            const p: Partial<k8s.V1ObjectMeta> = {};
            const m = metadataTemplate(p);
            const e: k8s.V1ObjectMeta = p as any;
            assert.deepStrictEqual(m, e);
        });

        it("should return empty metadata when passed nothing", () => {
            const m = metadataTemplate();
            const e: k8s.V1ObjectMeta = {} as any;
            assert.deepStrictEqual(m, e);
        });

        it("should return the partial metadata as metadata", () => {
            const p: Partial<k8s.V1ObjectMeta> = {
                name: "grant-lee-buffalo",
                namespace: "fuzzy",
                labels: {
                    "atomist.com/workspaceId": "SlASHR3C0RDS",
                    "app.kubernetes.io/managed-by": "tests",
                },
            };
            const m = metadataTemplate(p);
            const e: k8s.V1ObjectMeta = p as any;
            assert.deepStrictEqual(m, e);
        });

    });

});
