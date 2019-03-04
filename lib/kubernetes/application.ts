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

import {logger} from "@atomist/automation-client";
import * as k8s from "@kubernetes/client-node";
import * as stringify from "json-stringify-safe";
import {makeApiClients} from "./clients";
import {loadKubeConfig} from "./config";
import {
    deleteDeployment, kubeImageValidate, rollbackDeployment,
    upsertDeployment,
} from "./deployment";
import {
    deleteIngress,
    upsertIngress,
} from "./ingress";
import {upsertNamespace} from "./namespace";
import {
    deleteRbac,
    upsertRbac,
} from "./rbac";
import {
    KubernetesApplication,
    KubernetesDelete,
} from "./request";
import {
    deleteSecrets,
    upsertSecrets,
} from "./secret";
import {
    deleteService,
    upsertService,
} from "./service";

/**
 * Create or update all the resources for an application in a
 * Kubernetes cluster if it does not exist.
 *
 * @param app Kubernetes application creation request
 * @param sdmFulfiller The registered name of the SDM fulfilling the deployment goal.
 */
export async function upsertApplication(app: KubernetesApplication, sdmFulfiller: string): Promise<void> {
    let config: k8s.KubeConfig;
    try {
        config = loadKubeConfig();
    } catch (e) {
        e.message = `Failed to load Kubernetes config to deploy ${app.ns}/${app.name}: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    const clients = makeApiClients(config);
    const req = {...app, sdmFulfiller, clients};

    try {
        await upsertNamespace(req);
        await upsertRbac(req);
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
 * Validate an application from a kubernetes cluster. If any resource
 * requested to be validated does not exist, it is logged but no error
 * is returned.
 *
 * @param app
 */
export async function validateApplicationImage(app: KubernetesApplication): Promise<boolean> {
    let config: k8s.KubeConfig;
    try {
        config = loadKubeConfig();
    } catch (e) {
        e.message = `Failed to load Kubernetes config to validate ${app.ns}/${app.name}: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    const clients = makeApiClients(config);
    const req = {...app, clients};

    try {
        if (await kubeImageValidate(req, 120000) === false) {
            logger.error("validation failed.");
            return false;
        }
        return true;
    } catch (e) {
        e.message = `Failed to validate '${reqString(req)}': ${e.message}`;
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
export async function deleteApplication(del: KubernetesDelete): Promise<void> {
    const slug = `${del.ns}/${del.name}`;
    let config: k8s.KubeConfig;
    try {
        config = loadKubeConfig();
    } catch (e) {
        e.message(`Failed to load Kubernetes config to delete ${slug}: ${e.message}`);
        logger.error(e.message);
        throw e;
    }
    const clients = makeApiClients(config);
    const req = {...del, clients};

    const errs: Error[] = [];
    try {
        await deleteIngress(req);
    } catch (e) {
        e.message = `Failed to delete ingress ${slug}: ${e.message}`;
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
    try {
        await deleteRbac(req);
    } catch (e) {
        e.message = `Failed to delete RBAC resources for ${slug}: ${e.message}`;
        errs.push(e);
    }
    if (errs.length > 0) {
        const msg = `Failed to delete application '${reqString(req)}': ${errs.map(e => e.message).join("; ")}`;
        logger.error(msg);
        throw new Error(msg);
    }
}

/**
 * Rollback an application from a kubernetes cluster. If any resource
 * requested to be rolled back does not exist, it is logged but no
 * error is returned.
 *
 * @param roll delete application request object
 */
export async function rollbackApplication(roll: KubernetesDelete): Promise<void> {
    const slug = `${roll.ns}/${roll.name}`;
    let config: k8s.KubeConfig;
    try {
        config = loadKubeConfig();
    } catch (e) {
        e.message(`Failed to load kubernetes config to rollback ${slug}: ${e.message}`);
    }
    const clients = makeApiClients(config);
    const req = {...roll, clients};

    try {
        await rollbackDeployment(req);
    } catch (e) {
        e.message = `Failed to rollback '${reqString(req)}': ${e.message}`;
        logger.error(e.message);
        throw e;
    }
}

/** Stringify filter for a Kubernetes request object. */
export function reqFilter<T>(k: string, v: T): T | undefined {
    if (k === "config" || k === "clients" || k === "secrets") {
        return undefined;
    } else if (typeof v === "string" && v === "[Circular ~]") {
        return undefined;
    }
    return v;
}

/** Stringify a Kubernetes request object. */
export function reqString(req: any): string {
    return stringify(req, reqFilter);
}
