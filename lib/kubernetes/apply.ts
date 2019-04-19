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
import { execPromise } from "@atomist/sdm";
import * as k8s from "@kubernetes/client-node";
import * as fs from "fs-extra";
import * as http from "http";
import * as stringify from "json-stringify-safe";
import * as tmp from "tmp-promise";
import { errMsg } from "../support/error";
import {
    EssentialKubernetesObject,
    ObjectResponse,
    specUriPath,
} from "./api";

/**
 * Create or update a Kubernetes resource defined in a file.  This
 * uses the `kubectl` command-line utility rather than re-implement
 * its complicated apply logic since [server-side
 * apply](https://github.com/kubernetes/enhancements/issues/555) is in
 * the works.
 *
 * @param specPath path to Kuberenetes resource spec sufficient to identify and create the resource
 * @return response from the Kubernetes API.
 */
export async function applySpecFile(specPath: string): Promise<ObjectResponse> {
    try {
        const result = await execPromise("kubectl", ["apply", "-f", specPath, "-o", "json"]);
        const body: k8s.KubernetesObject = JSON.parse(result.stdout);
        const response: http.IncomingMessage = { statusCode: 200 } as any;
        return { body, response };
    } catch (e) {
        e.message = `Failed to apply '${specPath}' spec: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }
}

/**
 * Create or update a Kubernetes resource.  It creates a temporary
 * file and calls [[applySpecFile]] on it.
 *
 * @param spec Kuberenetes resource spec sufficient to identify and create the resource
 * @return response from the Kubernetes API.
 */
export async function applySpec(spec: EssentialKubernetesObject): Promise<ObjectResponse> {
    const slug = specUriPath(spec);
    let specFile: tmp.FileResult;
    let result: ObjectResponse;
    try {
        specFile = await tmp.file({ prefix: "sdm-pack-k8s-spec-", postfix: ".json" });
        await fs.writeFile(specFile.fd, stringify(spec));
        result = await applySpecFile(specFile.path);
    } catch (e) {
        e.message = `Failed to apply ${slug} spec: ${e.message}`;
        logger.error(e.message);
        throw e;
    } finally {
        if (specFile) {
            specFile.cleanup();
        }
    }
    return result;
}
