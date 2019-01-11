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
import * as k8s from "@kubernetes/client-node";
import * as http from "http";
import * as _ from "lodash";
import { DeepPartial } from "ts-essentials";
import { logRetry } from "../support/retry";
import {
    applicationLabels,
    matchLabels,
} from "./labels";
import { metadataTemplate } from "./metadata";
import {
    appName,
    KubernetesApplication,
    KubernetesDelete,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
} from "./request";

export interface UpsertSecretResponse {
    response: http.IncomingMessage;
    body: k8s.V1Secret;
}

/**
 * Create application secrets if they do not exist.  If a secret in
 * `req.secrets`, the secret is patched.  If `req.secrets` is false or
 * any empty array, no secrets are modified.
 *
 * @param req Kuberenetes application request
 * @return Response from Kubernetes API if resource is created or patched,
 *         `void` otherwise.
 */
export async function upsertSecrets(req: KubernetesResourceRequest): Promise<UpsertSecretResponse[]> {
    const slug = appName(req);
    if (!req.secrets || req.secrets.length < 1) {
        logger.debug(`No secrets provided, will not create secrets for ${slug}`);
        return [];
    }
    return Promise.all(req.secrets.map(async secret => {
        const secretName = `${req.ns}/${secret.metadata.name}`;
        try {
            await req.clients.core.readNamespacedSecret(secret.metadata.name, req.ns);
        } catch (e) {
            logger.debug(`Failed to read secret ${secretName}, creating: ${e.message}`);
            const secretSpec = await secretTemplate(req, secret);
            return logRetry(() => req.clients.core.createNamespacedSecret(req.ns, secretSpec),
                `create secret ${secretName} for ${slug}`);
        }
        logger.debug(`Secret ${secretName} exists, patching`);
        return logRetry(() => req.clients.core.patchNamespacedSecret(secret.metadata.name, req.ns, secret),
            `patch secret ${secretName} for ${slug}`);
    }));
}

/**
 * Delete secrets associated with application described by `req`, if
 * any exists.  If no such secrets exist, do nothing.
 *
 * @param req Kuberenetes delete request
 */
export async function deleteSecrets(req: KubernetesDeleteResourceRequest): Promise<void> {
    const slug = appName(req);
    let secrets: k8s.V1SecretList;
    try {
        const listResp = await req.clients.core.listNamespacedSecret(req.ns);
        secrets = listResp.body;
    } catch (e) {
        logger.debug(`Failed to list secrets in namespace ${req.ns}, not deleting secrets for ${slug}: ${e.message}`);
        return;
    }
    const appSecrets = applicationSecrets(req, secrets.items);
    const body: k8s.V1DeleteOptions = {} as any;
    for (const secret of appSecrets) {
        const secretName = `${req.ns}/${secret.metadata.name}`;
        await logRetry(() => req.clients.core.deleteNamespacedSecret(secret.metadata.name, req.ns, body),
            `delete secret ${secretName}`);
    }
    return;
}

/**
 * Given an array of all the secrets in a namespace, return the list
 * associated with the application described in `req`.
 *
 * @param secrets array of all secrets in a namespace
 * @return array of secrets associated with the application in `req`
 */
export function applicationSecrets(req: KubernetesDelete, secrets: k8s.V1Secret[]): k8s.V1Secret[] {
    const matchers = matchLabels(req);
    return secrets.filter(s => s.metadata.labels && Object.keys(matchers).every(l => s.metadata.labels[l] === matchers[l]));
}

/**
 * Add labels to a secret so we can delete it later.
 *
 * @param secret the unlabeled secret
 * @return the provided secret with appropriate labels
 */
export async function secretTemplate(req: KubernetesApplication, secret: DeepPartial<k8s.V1Secret>): Promise<k8s.V1Secret> {
    const labels = await applicationLabels({ ...req, component: "secret" });
    const metadata = metadataTemplate({ labels });
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const s: Partial<k8s.V1Secret> = {
        kind: "Secret",
        apiVersion: "v1",
        type: "Opaque",
        metadata,
    };
    _.merge(s, secret);
    return s as k8s.V1Secret;
}

/**
 * Create encoded opaque secret object from key-value pairs.
 *
 * @param secrets key-value pairs of secrets, the values are base64 encoded
 * @return Kubernetes secret object
 */
export function encodeSecret(name: string, data: { [key: string]: string }): k8s.V1Secret {
    const metadata = metadataTemplate({ name });
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const secret: Partial<k8s.V1Secret> = {
        apiVersion: "v1",
        kind: "Secret",
        type: "Opaque",
        metadata,
        data: {},
    };
    Object.keys(data).forEach(key => secret.data[key] = Buffer.from(data[key]).toString("base64"));
    return secret as k8s.V1Secret;
}
