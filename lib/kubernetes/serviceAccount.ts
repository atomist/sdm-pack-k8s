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
import { applicationLabels } from "./labels";
import { metadataTemplate } from "./metadata";
import {
    appName,
    KubernetesApplication,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
    KubernetesSdm,
} from "./request";

/**
 * Create or patch service account.
 *
 * @param req Kuberenetes application request
 * @return Kubernetes resource spec used to create/patch the resource
 */
export async function upsertServiceAccount(req: KubernetesResourceRequest): Promise<k8s.V1ServiceAccount> {
    const slug = appName(req);
    const spec = await serviceAccountTemplate(req);
    try {
        await req.clients.core.readNamespacedServiceAccount(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read service account ${slug}, creating: ${errMsg(e)}`);
        await logRetry(() => req.clients.core.createNamespacedServiceAccount(req.ns, spec),
            `create service account ${slug}`);
        return spec;
    }
    logger.debug(`Service account ${slug} exists, patching using '${stringify(spec)}'`);
    await logRetry(() => req.clients.core.patchNamespacedServiceAccount(req.name, req.ns, spec),
        `patch service account ${slug}`);
    return spec;
}

/**
 * Delete Kubernetes application service account if it exists.
 *
 * @param req Kuberenetes delete request
 * @return Deleted service account spec, or undefined it no service account exists
 */
export async function deleteServiceAccount(req: KubernetesDeleteResourceRequest): Promise<k8s.V1ServiceAccount | undefined> {
    const slug = appName(req);
    let sa: k8s.V1ServiceAccount;
    try {
        const resp = await req.clients.core.readNamespacedServiceAccount(req.name, req.ns);
        sa = resp.body;
    } catch (e) {
        logger.debug(`Service account ${slug} does not exist: ${errMsg(e)}`);
        return undefined;
    }
    await logRetry(() => req.clients.core.deleteNamespacedServiceAccount(req.name, req.ns), `delete service account ${slug}`);
    return sa;
}

/**
 * Create service account spec for a Kubernetes application.  The
 * `req.rbac.serviceAccountSpec`, if it not false, is merged into the
 * spec created by this function using `lodash.merge(default,
 * req.rbac.serviceAccountSpec)`.
 *
 * @param req application request
 * @return service account resource specification
 */
export async function serviceAccountTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1ServiceAccount> {
    const labels = applicationLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        namespace: req.ns,
        labels,
    });
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const sa: DeepPartial<k8s.V1ServiceAccount> = {
        kind: "ServiceAccount",
        apiVersion: "v1",
        metadata,
    };
    if (req.serviceAccountSpec) {
        _.merge(sa, req.serviceAccountSpec);
    }
    return sa as k8s.V1ServiceAccount;
}
