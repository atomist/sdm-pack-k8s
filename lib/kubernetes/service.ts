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
import * as stringify from "json-stringify-safe";
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

/**
 * If `req.port` is truthy, create a service if it does not exist and
 * patch it if it does.  Any provided `req.serviceSpec` is merged
 * using [[serviceTemplate]] before creating/patching.
 *
 * @param req Kuberenetes application request
 * @return Kubernetes resource spec used to create/patch resource, or undefined if port not defined
 */
export async function upsertService(req: KubernetesResourceRequest): Promise<k8s.V1Service | undefined> {
    const slug = appName(req);
    if (!req.port) {
        logger.debug(`Port not provided, will not create service ${slug}`);
        return undefined;
    }
    const spec = await serviceTemplate(req);
    try {
        await req.clients.core.readNamespacedService(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read service ${slug}, creating: ${errMsg(e)}`);
        logger.debug(`Creating service ${slug} using '${stringify(spec)}'`);
        await logRetry(() => req.clients.core.createNamespacedService(req.ns, spec), `create service ${slug}`);
        return spec;
    }
    logger.debug(`Service ${slug} exists, patching using '${stringify(spec)}'`);
    await logRetry(() => req.clients.core.patchNamespacedService(req.name, req.ns, spec),
        `patch service ${slug}`);
    return spec;
}

/**
 * Delete a service if it exists.  If the resource does not exist, do
 * nothing.
 *
 * @param req Kuberenetes delete request
 * @return Simple deleted service spec, or undefined if resource does not exist
 */
export async function deleteService(req: KubernetesDeleteResourceRequest): Promise<k8s.V1Service | undefined> {
    const slug = appName(req);
    let svc: k8s.V1Service;
    try {
        const resp = await req.clients.core.readNamespacedService(req.name, req.ns);
        svc = resp.body;
    } catch (e) {
        logger.debug(`Service ${slug} does not exist: ${errMsg(e)}`);
        return undefined;
    }
    await logRetry(() => req.clients.core.deleteNamespacedService(req.name, req.ns), `delete service ${slug}`);
    return svc;
}

/**
 * Create service spec to front a Kubernetes application.  If the
 * request has a `serviceSpec`, it is merged into the spec created
 * by this function using `lodash.merge(default, req.serviceSpec)`.
 *
 * @param req service template request
 * @return service resource specification
 */
export async function serviceTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1Service> {
    const labels = applicationLabels(req);
    const matchers = matchLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        labels,
    });
    const apiVersion = "v1";
    const kind = "Service";
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const s: DeepPartial<k8s.V1Service> = {
        apiVersion,
        kind,
        metadata,
        spec: {
            ports: [
                {
                    name: "http",
                    protocol: "TCP",
                    port: req.port,
                    targetPort: "http" as any, // DeepPartial or TypeScript bug?
                },
            ],
            selector: matchers,
            sessionAffinity: "None",
            type: "NodePort",
        },
    };
    if (req.serviceSpec) {
        _.merge(s, req.serviceSpec, { apiVersion, kind });
    }
    return s as k8s.V1Service;
}
