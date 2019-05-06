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
import * as stringify from "json-stringify-safe";
import { DeepPartial } from "ts-essentials";
import { errMsg } from "../support/error";
import { logRetry } from "../support/retry";
import { applicationLabels } from "./labels";
import { metadataTemplate } from "./metadata";
import {
    KubernetesApplication,
    KubernetesResourceRequest,
    KubernetesSdm,
} from "./request";

export const defaultNamespace = "default";

export interface UpsertNamespaceResponse {
    response: http.IncomingMessage;
    body: k8s.V1Namespace;
}

/**
 * Create or update a namespace.
 *
 * @param req Kuberenetes application request
 */
export async function upsertNamespace(req: KubernetesResourceRequest): Promise<UpsertNamespaceResponse> {
    const slug = req.ns;
    const spec = await namespaceTemplate(req);
    try {
        await req.clients.core.readNamespace(req.ns);
        logger.debug(`Namespace ${slug} exists`);
    } catch (e) {
        logger.debug(`Failed to get namespace ${slug}, creating: ${errMsg(e)}`);
        logger.debug(`Creating namespace ${slug} using '${stringify(spec)}'`);
        return logRetry(() => req.clients.core.createNamespace(spec), `create namespace ${slug}`);
    }
    logger.debug(`Namespace ${slug} exists, patching using '${stringify(spec)}'`);
    return logRetry(() => req.clients.core.patchNamespace(req.ns, spec), `patch namespace ${slug}`);
}

/**
 * Create namespace resource.
 *
 * @param req Kubernetes application
 * @return kubernetes namespace resource
 */
export async function namespaceTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1Namespace> {
    const allLabels = applicationLabels(req);
    const retain = ["atomist.com/workspaceId", "app.kubernetes.io/managed-by"];
    const labels = Object.assign({}, ...Object.keys(allLabels).filter(k => retain.includes(k)).map(k => ({ [k]: allLabels[k] })));
    const metadata = metadataTemplate({ labels, name: req.ns });
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const ns: DeepPartial<k8s.V1Namespace> = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata,
    };
    return ns as k8s.V1Namespace;
}
