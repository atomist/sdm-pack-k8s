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
import * as stringify from "json-stringify-safe";
import { errMsg } from "../support/error";
import { logRetry } from "../support/retry";
import {
    K8sObject,
    K8sObjectApi,
    K8sObjectResponse,
    specUriPath,
} from "./api";
import { loadKubeConfig } from "./config";

/**
 * Create or update a Kubernetes resource.  This implmentation uses
 * get, patch, and create, but will likely switch to [server-side
 * apply](https://github.com/kubernetes/enhancements/issues/555) when
 * it is available.
 *
 * @param spec Kuberenetes resource spec sufficient to identify and create the resource
 * @return response from the Kubernetes API.
 */
export async function applySpec(spec: K8sObject): Promise<K8sObjectResponse> {
    const slug = specUriPath(spec);
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
        logger.debug(`Failed to read resource ${slug}: ${errMsg(e)}`);
        logger.debug(`Creating resource ${slug} using '${stringify(spec)}'`);
        return logRetry(() => client.create(spec), `create resource ${slug}`);
    }
    logger.debug(`Patching resource ${slug} using '${stringify(spec)}'`);
    return logRetry(() => client.patch(spec), `patch resource ${slug}`);
}
