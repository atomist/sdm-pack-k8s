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

import { logger } from "@atomist/automation-client";
import { errMsg } from "../support/error";
import { logRetry } from "../support/retry";
import {
    K8sDeleteResponse,
    K8sObject,
    K8sObjectApi,
    specUriPath,
} from "./api";
import { loadKubeConfig } from "./config";
import { stringifyObject } from "./resource";

/**
 * Delete a resource if it exists.  If the resource does not exist,
 * do nothing.
 *
 * @param spec Kuberenetes spec of resource to delete
 * @return DeleteResponse if object existed and was deleted, undefined if it did not exist
 */
export async function deleteSpec(spec: K8sObject): Promise<K8sDeleteResponse | undefined> {
    const slug = specUriPath(spec, "read");
    let client: K8sObjectApi;
    try {
        const kc = loadKubeConfig();
        client = kc.makeApiClient(K8sObjectApi);
    } catch (e) {
        e.message = `Failed to create Kubernetes client: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }
    try {
        await client.read(spec);
    } catch (e) {
        logger.debug(`Kubernetes resource ${slug} does not exist: ${errMsg(e)}`);
        return undefined;
    }
    logger.info(`Deleting resource ${slug} using '${stringifyObject(spec)}'`);
    return logRetry(() => client.delete(spec), `delete resource ${slug}`);
}
