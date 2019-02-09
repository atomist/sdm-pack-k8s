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

import * as stringify from "json-stringify-safe";

/**
 * Extract message from a variety of error types.  If message is not
 * found in any of the standard places, safely stringify the error.
 *
 * @param e Some sort of Error or similar
 * @return Error message
 */
export function errMsg(e: any): string {
    if (!e) {
        return stringify(e);
    } else if (typeof e === "string") {
        return e;
    } else if (Array.isArray(e)) {
        return stringify(e);
    } else if (e.message) {
        return e.message;
    } else if (e.body && e.body.message) {
        return e.body.message;
    } else if (e.response && e.response.body && e.response.body.message) {
        return e.response.body.message;
    } else {
        return stringify(e, keyFilter);
    }
}

/** Omit possibly secret values from stringified object. */
function keyFilter<T>(key: string, value: T): T | string | undefined {
    if (/secret|token|password|jwt|url|secret|auth|key|cert|pass|user/i.test(key)) {
        if (typeof value === "string") {
            const masked = (value.length < 16) ? "*".repeat(value.length) :
                value.charAt(0) + "*".repeat(value.length - 2) + value.charAt(value.length - 1);
            return masked;
        }
        return undefined;
    }
    return value;
}
