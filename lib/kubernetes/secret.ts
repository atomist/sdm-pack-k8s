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
import * as k8s from "@kubernetes/client-node";
import * as _ from "lodash";
import { DeepPartial } from "ts-essentials";
import {
    decrypt,
    encrypt,
} from "../support/crypto";
import { errMsg } from "../support/error";
import { logRetry } from "../support/retry";
import {
    applicationLabels,
    matchLabels,
} from "./labels";
import { metadataTemplate } from "./metadata";
import {
    appName,
    KubernetesApplication,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
    KubernetesSdm,
} from "./request";

/**
 * Create application secrets if they do not exist.  If a secret in
 * `req.secrets` exists, the secret is patched.  The provided secrets
 * are merged through [[secretTemplate]] before creating/patching.  If
 * `req.secrets` is false or any empty array, no secrets are modified.
 *
 * @param req Kuberenetes application request
 * @return Array of secret specs created/patched, which array may be empty
 */
export async function upsertSecrets(req: KubernetesResourceRequest): Promise<k8s.V1Secret[]> {
    const slug = appName(req);
    if (!req.secrets || req.secrets.length < 1) {
        logger.debug(`No secrets provided, will not create secrets for ${slug}`);
        return [];
    }
    return Promise.all(req.secrets.map(async secret => {
        const secretName = `${req.ns}/${secret.metadata.name}`;
        const spec = await secretTemplate(req, secret);
        try {
            await req.clients.core.readNamespacedSecret(secret.metadata.name, req.ns);
        } catch (e) {
            logger.debug(`Failed to read secret ${secretName}, creating: ${errMsg(e)}`);
            await logRetry(() => req.clients.core.createNamespacedSecret(req.ns, spec),
                `create secret ${secretName} for ${slug}`);
            return spec;
        }
        logger.debug(`Secret ${secretName} exists, patching`);
        await logRetry(() => req.clients.core.patchNamespacedSecret(secret.metadata.name, req.ns, spec),
            `patch secret ${secretName} for ${slug}`);
        return spec;
    }));
}

/**
 * Delete secrets associated with application described by `req`, if
 * any exists.  If no such secrets exist, do nothing.
 *
 * @param req Kubernetes application delete request
 * @return Array of deleted secret specs, which may be empty
 */
export async function deleteSecrets(req: KubernetesDeleteResourceRequest): Promise<k8s.V1Secret[]> {
    const slug = appName(req);
    let secrets: k8s.V1SecretList;
    const matchers = matchLabels(req);
    const labelSelector = Object.keys(matchers).map(l => `${l}=${matchers[l]}`).join(",");
    try {
        const listResp = await req.clients.core.listNamespacedSecret(req.ns, undefined, undefined,
            undefined, undefined, labelSelector);
        secrets = listResp.body;
    } catch (e) {
        e.message = `Failed to list secrets in namespace for ${slug}: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }
    return Promise.all(secrets.items.map(async secret => {
        const secretName = `${req.ns}/${secret.metadata.name}`;
        await logRetry(() => req.clients.core.deleteNamespacedSecret(secret.metadata.name, req.ns),
            `delete secret ${secretName}`);
        return secret;
    }));
}

/**
 * Add labels to a secret so we can delete it later.
 *
 * @param secret the unlabeled secret
 * @return the provided secret with appropriate labels
 */
export async function secretTemplate(req: KubernetesApplication & KubernetesSdm, secret: DeepPartial<k8s.V1Secret>): Promise<k8s.V1Secret> {
    const labels = applicationLabels({ ...req, component: "secret" });
    const metadata = metadataTemplate({
        namespace: req.ns,
        labels,
    });
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
 * Create encoded opaque secret object from key/value pairs.
 *
 * @param secrets Key/value pairs of secrets, the values will be base64 encoded in the returned secret
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

/**
 * Encrypt secret values, which should already be base64 encoded.
 *
 * @param secret Kubernetes secret with base64 encoded data values
 * @return Kubernetes secret object with encrypted data values
 */
export async function encryptSecret(secret: DeepPartial<k8s.V1Secret>, key: string): Promise<k8s.V1Secret> {
    for (const datum of Object.keys(secret.data)) {
        secret.data[datum] = await encrypt(secret.data[datum], key);
    }
    return secret as k8s.V1Secret;
}

/**
 * Dencrypt secret values.
 *
 * @param secret Kubernetes secret with encrypted data values
 * @return Kubernetes secret object with base64 encoded data values
 */
export async function decryptSecret(secret: DeepPartial<k8s.V1Secret>, key: string): Promise<k8s.V1Secret> {
    for (const datum of Object.keys(secret.data)) {
        secret.data[datum] = await decrypt(secret.data[datum], key);
    }
    return secret as k8s.V1Secret;
}
