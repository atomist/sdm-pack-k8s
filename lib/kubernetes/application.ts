/*
 * Copyright © 2018 Atomist, Inc.
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
import * as _ from "lodash";
import { makeApiClients } from "./clients";
import {
    deleteDeployment,
    upsertDeployment,
} from "./deployment";
import {
    deleteIngress,
    upsertIngress,
} from "./ingress";
import { upsertNamespace } from "./namespace";
import {
    KubernetesApplicationRequest,
    KubernetesDeleteRequest,
} from "./request";
import {
    deleteSecrets,
    upsertSecrets,
} from "./secret";
import {
    deleteService,
    upsertService,
} from "./service";

/** Stringify filter for a Kubernetes request object. */
function reqFilter<T>(k: string, v: T): T {
    if (k === "config" || k === "clients") {
        return undefined;
    }
    return v;
}

/** Stringify a Kubernetes request object. */
function reqString(req: any): string {
    return stringify(req, reqFilter);
}

/**
 * Create or update all the resources for an application in a
 * Kubernetes cluster if it does not exist.
 *
 * @param req application creation request
 */
export async function upsertApplication(upReq: KubernetesApplicationRequest): Promise<void> {

    const clients = makeApiClients(upReq.config);
    const req = { ...upReq, clients };

    try {
        await upsertNamespace(req);
        await upsertService(req);
        await upsertSecrets(req);
        await upsertDeployment(req);
        await upsertIngress(req);
    } catch (e) {
        e.message = `Failed to upsert '${reqString(req)}': ${e.message}`;
        logger.error(e.message);
        throw e;
    }
}

/**
 * Delete an application from a kubernetes cluster.  If any resource
 * requested to be deleted does not exist, it is logged but no error
 * is returned.
 *
 * @param req delete application request object
 */
export async function deleteApplication(delReq: KubernetesDeleteRequest): Promise<void> {
    const clients = makeApiClients(delReq.config);
    const req = { ...delReq, clients };
    const slug = `${req.ns}/${req.name}`;

    const errs: Error[] = [];
    try {
        await deleteIngress(req);
    } catch (e) {
        e.message = `Failed to remove rule for ${slug} from ingress: ${e.message}`;
        errs.push(e);
    }
    try {
        await deleteDeployment(req);
    } catch (e) {
        e.message = `Failed to delete deployment ${slug}: ${e.message}`;
        errs.push(e);
    }
    try {
        await deleteSecrets(req);
    } catch (e) {
        e.message = `Failed to delete secrets of ${slug}: ${e.message}`;
        errs.push(e);
    }
    try {
        await deleteService(req);
    } catch (e) {
        e.message = `Failed to delete service ${slug}: ${e.message}`;
        errs.push(e);
    }
    if (errs.length > 0) {
        const msg = `Failed to delete application '${reqString(req)}': ${errs.map(e => e.message).join("; ")}`;
        logger.error(msg);
        throw new Error(msg);
    }
}
