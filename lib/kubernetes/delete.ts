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
    DeleteResponse,
    EssentialKubernetesObject,
    KubernetesObjectApi,
    specUriPath,
} from "./api";
import { loadKubeConfig } from "./config";

/**
 * Delete a resource if it exists.  If the resource does not exist,
 * do nothing.
 *
 * @param spec Kuberenetes spec of resource to delete
 * @return DeleteResponse if object existed and was deleted, void if it did not exist
 */
export async function deleteSpec(spec: EssentialKubernetesObject): Promise<DeleteResponse | void> {
    const slug = specUriPath(spec);
    let client: KubernetesObjectApi;
    try {
        const kc = loadKubeConfig();
        client = kc.makeApiClient(KubernetesObjectApi);
    } catch (e) {
        e.message = `Failed to create Kubernetes client: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }
    try {
        await client.read(spec);
    } catch (e) {
        logger.debug(`Kubernetes resource ${slug} does not exist: ${errMsg(e)}`);
        return;
    }
    return logRetry(() => client.delete(spec), `delete resource ${slug}`);
}
