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
import {
    parseNameStatusDiff,
    PushDiff,
} from "../../lib/sync/diff";

describe("sync/diff", () => {

    describe("parseNameStatusDiff", () => {

        it("should safely parse nothing", () => {
            const s = "87c6ba8a3e2e3961d318fa8c50885b1ca0c4e1dc";
            ["", "\n", "\0", "\0\n"].forEach(d => {
                const c = parseNameStatusDiff(s, d);
                const e: PushDiff[] = [];
                assert.deepStrictEqual(c, e);
            });
        });

        it("should parse valid input", () => {
            const s = "87c6ba8a3e2e3961d318fa8c50885b1ca0c4e1dc";
            const ds = [
                "D a.yaml A aa.json D b.yml A d.json M e.json A fyml A i/j/k/l.json A s t.json M x.yaml ",
                "D a.yaml A aa.json D b.yml A d.json M e.json A fyml A i/j/k/l.json A s t.json M x.yaml \n",
            ];
            ds.forEach(d => {
                const c = parseNameStatusDiff(s, d);
                const e: PushDiff[] = [
                    { sha: s, change: "delete", path: "a.yaml" },
                    { sha: s, change: "delete", path: "b.yml" },
                    { sha: s, change: "apply", path: "aa.json" },
                    { sha: s, change: "apply", path: "d.json" },
                    { sha: s, change: "apply", path: "e.json" },
                    { sha: s, change: "apply", path: "s t.json" },
                    { sha: s, change: "apply", path: "x.yaml" },
                ];
                assert.deepStrictEqual(c, e);
            });
        });

        it("should sort the paths", () => {
            const s = "87c6ba8a3e2e3961d318fa8c50885b1ca0c4e1dc";
            const d = "D a.yaml A s t.json D b.yml A d.json M e.json A aa.json A i/j/k/l.json M x.yaml A f ";
            const c = parseNameStatusDiff(s, d);
            const e: PushDiff[] = [
                { sha: s, change: "delete", path: "a.yaml" },
                { sha: s, change: "delete", path: "b.yml" },
                { sha: s, change: "apply", path: "aa.json" },
                { sha: s, change: "apply", path: "d.json" },
                { sha: s, change: "apply", path: "e.json" },
                { sha: s, change: "apply", path: "s t.json" },
                { sha: s, change: "apply", path: "x.yaml" },
            ];
            assert.deepStrictEqual(c, e);
        });

    });

});
