/*
 * Copyright © 2020 Atomist, Inc.
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

import { logger } from "@atomist/automation-client/lib/util/logger";
import * as pRetry from "p-retry";
import { errMsg } from "./error";

export const DefaultLogRetryOptions: pRetry.Options = {
    retries: 5,
    factor: 2,
    minTimeout: 0.1 * 1000,
    maxTimeout: 3 * 1000,
    randomize: true,
};

/**
 * Add logging to promise-based retry.
 */
export async function logRetry<T>(f: () => Promise<T>, desc: string, options: pRetry.Options = DefaultLogRetryOptions): Promise<T> {
    const opts: pRetry.Options = {
        onFailedAttempt: e => {
            logger.debug(`Error in ${desc} attempt ${e.attemptNumber}: ${errMsg(e)}`);
        },
        ...options,
    };
    return pRetry(async (count: number) => {
        logger.debug(`Retry ${desc} attempt ${count}`);
        let r: T;
        try {
            r = await f();
        } catch (e) {
            if (!(e instanceof Error)) {
                const err = new Error(errMsg(e));
                Object.keys(e).forEach(k => (err as any)[k] = e[k]);
                throw err;
            }
            throw e;
        }
        return r;
    }, opts);
}
