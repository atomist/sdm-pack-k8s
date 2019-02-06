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
import * as http from "http";
import * as _ from "lodash";
import { DeepPartial } from "ts-essentials";
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

export interface UpsertSecretResponse {
    response: http.IncomingMessage;
    body: k8s.V1Secret;
}

/**
 * Create application secrets if they do not exist.  If a secret in
 * `req.secrets` exists, the secret is patched.  The provided secrets
 * are merged through [[secretTemplate]] before creating/patching.  If
 * `req.secrets` is false or any empty array, no secrets are modified.
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
        const spec = await secretTemplate(req, secret);
        try {
            await Promise.resolve(req.clients.core.readNamespacedSecret(secret.metadata.name, req.ns));
        } catch (e) {
            logger.debug(`Failed to read secret ${secretName}, creating: ${errMsg(e)}`);
            return logRetry(() => req.clients.core.createNamespacedSecret(req.ns, spec),
                `create secret ${secretName} for ${slug}`);
        }
        logger.debug(`Secret ${secretName} exists, patching`);
        return logRetry(() => req.clients.core.patchNamespacedSecret(secret.metadata.name, req.ns, spec),
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
    const matchers = matchLabels(req);
    const labelSelector = Object.keys(matchers).map(l => `${l}=${matchers[l]}`).join(",");
    try {
        const listResp = await Promise.resolve(req.clients.core.listNamespacedSecret(req.ns, undefined, undefined,
            undefined, undefined, labelSelector));
        secrets = listResp.body;
    } catch (e) {
        logger.debug(`Failed to list secrets in namespace ${req.ns}, not deleting secrets for ${slug}: ${errMsg(e)}`);
        return;
    }
    for (const secret of secrets.items) {
        const secretName = `${req.ns}/${secret.metadata.name}`;
        await logRetry(() => req.clients.core.deleteNamespacedSecret(secret.metadata.name, req.ns),
            `delete secret ${secretName}`);
    }
    return;
}

/**
 * Add labels to a secret so we can delete it later.
 *
 * @param secret the unlabeled secret
 * @return the provided secret with appropriate labels
 */
export async function secretTemplate(req: KubernetesApplication & KubernetesSdm, secret: DeepPartial<k8s.V1Secret>): Promise<k8s.V1Secret> {
    const labels = applicationLabels({ ...req, component: "secret" });
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
