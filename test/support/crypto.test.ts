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
    decrypt,
    encrypt,
} from "../../lib/support/crypto";

describe("support/crypt", () => {

    describe("decrypt", () => {

        it("should decrypt", async () => {
            const t = "5baec0da09a567b4598e72e474785dc2";
            const k = "thereisalightthatnevergoesout";
            const m = await decrypt(t, k);
            assert(m === "Th3$m1t4$");
        });

    });

    describe("encrypt", () => {

        it("should encrypt", async () => {
            const t = "Th3$m1t4$";
            const k = "thereisalightthatnevergoesout";
            const m = await encrypt(t, k);
            assert(m === "5baec0da09a567b4598e72e474785dc2");
        });

    });

    describe("integration", () => {

        it("should encrypt and decrypt", async () => {
            const t = "$0m3$3cr3t";
            const k = "thereisalightthatnevergoesout";
            const e = await encrypt(t, k);
            const o = await decrypt(e, k);
            assert(o === t);
        });

    });

});
