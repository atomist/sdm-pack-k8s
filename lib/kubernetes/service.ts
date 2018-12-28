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
import * as _ from "lodash";
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
} from "./request";

export interface UpsertServiceResponse {
    response: http.IncomingMessage;
    body: k8s.V1Service;
}

/**
 * Create a service if it does not exist.  If `req.port` is false, no
 * service is created.  If service exists and `req.serviceSpec` is
 * provided, the service is patched.
 *
 * @param req Kuberenetes application request
 * @return Response from Kubernetes API if service is created or patched,
 *         `void` otherwise.
 */
export async function upsertService(req: KubernetesResourceRequest): Promise<UpsertServiceResponse | void> {
    const slug = appName(req);
    if (!req.port) {
        logger.debug(`Port not provided, will not create service ${slug}`);
        return;
    }
    try {
        await req.clients.core.readNamespacedService(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read service ${slug}, creating: ${e.message}`);
        const svc = await serviceTemplate(req);
        logger.debug(`Creating service ${slug} using '${stringify(svc)}'`);
        return logRetry(() => req.clients.core.createNamespacedService(req.ns, svc), `create service ${slug}`);
    }
    logger.debug(`Service ${slug} exists`);
    if (req.serviceSpec) {
        logger.debug(`Patching service ${slug} using '${stringify(req.serviceSpec)}'`);
        return logRetry(() => req.clients.core.patchNamespacedService(req.name, req.ns, req.serviceSpec),
            `patch service ${slug}`);
    }
    return;
}

/**
 * Delete a service if it exists.  If the resource does not exist, do
 * nothing.
 *
 * @param req Kuberenetes delete request
 */
export async function deleteService(req: KubernetesDeleteResourceRequest): Promise<void> {
    const slug = appName(req);
    try {
        await req.clients.core.readNamespacedService(req.name, req.ns);
    } catch (e) {
        logger.debug(`Service ${slug} does not exist: ${e.message}`);
        return;
    }
    const body: k8s.V1DeleteOptions = {} as any;
    await logRetry(() => req.clients.core.deleteNamespacedService(req.name, req.ns, body), `delete service ${slug}`);
    return;
}

/**
 * Create service spec to front a Kubernetes application.  If the
 * request has a `serviceSpec`, it is merged into the spec created
 * by this function using `lodash.merge(default, req.serviceSpec)`.
 *
 * @param req service template request
 * @return service resource speciification
 */
export async function serviceTemplate(req: KubernetesApplication): Promise<k8s.V1Service> {
    const labels = await applicationLabels(req);
    const matchers = matchLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        labels,
    });
    const s: k8s.V1Service = {
        kind: "Service",
        apiVersion: "v1",
        metadata,
        spec: {
            ports: [
                {
                    name: "http",
                    protocol: "TCP",
                    port: req.port,
                    targetPort: "http",
                },
            ],
            selector: matchers,
            sessionAffinity: "None",
            type: "NodePort",
        },
    } as any; // avoid https://github.com/kubernetes-client/javascript/issues/87
    if (req.serviceSpec) {
        _.merge(s, req.serviceSpec);
    }
    return s;
}
