#! /usr/bin/env node
// Simple script to help encrypt and decrypt secret data
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
    decrypt,
    encrypt,
} from "../lib/support/crypto";

/* tslint:disable:no-console */

async function main(): Promise<void> {
    if (process.argv.length !== 5) {
        console.error(`Usage: secret encrypt|decrypt KEY TEXT`);
        process.exit(2);
    }
    const action = process.argv[2];
    const key = process.argv[3];
    const text = process.argv[4];
    if (action === "encrypt") {
        console.log(await encrypt(text, key));
    } else if (action === "decrypt") {
        console.log(await decrypt(text, key));
    } else {
        console.error(`Unsupported action, must be "encrypt" or "decrypt": ${action}`);
        process.exit(1);
    }
}

main().then(() => process.exit(0), err => {
    console.error(`Unhandled exception: ${err.message}`);
    process.exit(99);
});
