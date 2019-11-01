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
import { stringifyObject } from "./resource";

export const defaultNamespace = "default";

/**
 * Create or update a namespace.
 *
 * @param req Kuberenetes application request
 * @return Kubernetes resource spec used to create/patch the resource
 */
export async function upsertNamespace(req: KubernetesResourceRequest): Promise<k8s.V1Namespace> {
    const slug = req.ns;
    const spec = await namespaceTemplate(req);
    try {
        await req.clients.core.readNamespace(spec.metadata.name);
        logger.debug(`Namespace ${slug} exists`);
    } catch (e) {
        logger.debug(`Failed to get namespace ${slug}, creating: ${errMsg(e)}`);
        logger.info(`Creating namespace ${slug} using '${stringifyObject(spec)}'`);
        await logRetry(() => req.clients.core.createNamespace(spec), `create namespace ${slug}`);
        return spec;
    }
    logger.info(`Namespace ${slug} exists, patching using '${stringifyObject(spec)}'`);
    try {
        await logRetry(() => req.clients.core.patchNamespace(spec.metadata.name, spec), `patch namespace ${slug}`);
    } catch (e) {
        logger.warn(`Failed to patch existing namespace ${slug}, ignoring: ${errMsg(e)}`);
    }
    return spec;
}

/**
 * Create namespace resource.
 *
 * @param req Kubernetes application
 * @return Kubernetes namespace resource
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
