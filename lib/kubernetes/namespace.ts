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
import * as stringify from "json-stringify-safe";
import { logRetry } from "../support/retry";
import { applicationLabels } from "./labels";
import { metadataTemplate } from "./metadata";
import {
    KubernetesApplication,
    KubernetesResourceRequest,
} from "./request";

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
    try {
        const resp = await req.clients.core.readNamespace(req.ns);
        logger.debug(`Namespace ${req.ns} exists`);
        return resp;
    } catch (e) {
        logger.debug(`Failed to get namespace ${req.ns}, creating: ${e.message}`);
        const ns = await namespaceTemplate(req);
        logger.debug(`Creating namespace ${req.ns} using '${stringify(ns)}'`);
        return logRetry(() => req.clients.core.createNamespace(ns), `create namespace ${req.ns}`);
    }
}

/**
 * Create namespace resource.
 *
 * The `as any` in this method because of
 * https://github.com/kubernetes-client/javascript/issues/87
 *
 * @param req Kubernetes application
 * @return kubernetes namespace resource
 */
export async function namespaceTemplate(req: KubernetesApplication): Promise<k8s.V1Namespace> {
    const allLabels = await applicationLabels(req);
    const retain = ["atomist.com/workspaceId", "atomist.com/environment", "app.kubernetes.io/managed-by"];
    const labels = Object.assign({}, ...Object.keys(allLabels).filter(k => retain.includes(k)).map(k => ({ [k]: allLabels[k] })));
    const metadata = metadataTemplate({ labels, name: req.ns });
    const ns: k8s.V1Namespace = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata,
    } as any;
    return ns;
}
