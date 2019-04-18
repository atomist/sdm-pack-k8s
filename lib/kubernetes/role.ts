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
 * Create or patch role or cluster role.
 *
 * @param req Kubernetes application request
 * @return Kubernetes resource spec used to create/update the resource
 */
export async function upsertRole(req: KubernetesResourceRequest): Promise<k8s.V1Role | k8s.V1ClusterRole> {
    const slug = appName(req);
    if (req.roleSpec.kind === "ClusterRole") {
        const spec = await clusterRoleTemplate(req);
        try {
            await req.clients.rbac.readClusterRole(req.name);
        } catch (e) {
            logger.debug(`Failed to read cluster role ${slug}, creating: ${errMsg(e)}`);
            logger.debug(`Creating cluster role ${slug} using '${stringify(spec)}'`);
            await logRetry(() => req.clients.rbac.createClusterRole(spec), `create cluster role ${slug}`);
            return spec;
        }
        logger.debug(`Cluster role ${slug} exists, patching using '${stringify(spec)}'`);
        await logRetry(() => req.clients.rbac.patchClusterRole(req.name, spec), `patch cluster role ${slug}`);
        return spec;
    } else {
        const spec = await roleTemplate(req);
        try {
            await req.clients.rbac.readNamespacedRole(req.name, req.ns);
        } catch (e) {
            logger.debug(`Failed to read role ${slug}, creating: ${errMsg(e)}`);
            await logRetry(() => req.clients.rbac.createNamespacedRole(req.ns, spec), `create role ${slug}`);
            return spec;
        }
        logger.debug(`Role ${slug} exists, patching using '${stringify(spec)}'`);
        await logRetry(() => req.clients.rbac.patchNamespacedRole(req.name, req.ns, spec), `patch role ${slug}`);
        return spec;
    }
}

/**
 * Delete Kubernetes application role or cluster role.
 *
 * @param req Kuberenetes delete request
 * @return Deleted role or cluster role spec, or undefined if no (cluster) role exists
 */
export async function deleteRole(req: KubernetesDeleteResourceRequest): Promise<k8s.V1Role | k8s.V1ClusterRole | undefined> {
    const slug = appName(req);
    let role: k8s.V1Role | k8s.V1ClusterRole;

    try {
        const resp = await req.clients.rbac.readNamespacedRole(req.name, req.ns);
        role = resp.body;
    } catch (e) {
        logger.debug(`Role ${slug} does not exist: ${errMsg(e)}`);
    }
    if (role) {
        await logRetry(() => req.clients.rbac.deleteNamespacedRole(req.name, req.ns), `delete role ${slug}`);
        return role;
    }

    try {
        const resp = await req.clients.rbac.readClusterRole(req.name, req.ns);
        role = resp.body;
    } catch (e) {
        logger.debug(`Cluster role ${slug} does not exist: ${errMsg(e)}`);
    }
    if (role) {
        await logRetry(() => req.clients.rbac.deleteClusterRole(req.name, req.ns), `delete cluster role ${slug}`);
        return role;
    }

    return undefined;
}

/**
 * Create role spec for a Kubernetes application.  The
 * `req.rbac.roleSpec` is merged into the spec created by this
 * function using `lodash.merge(default, req.rbac.roleSpec)`.
 *
 * @param req application request
 * @return role resource specification
 */
export async function roleTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1Role> {
    const labels = applicationLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        namespace: req.ns,
        labels,
    });
    const r: k8s.V1Role = {
        kind: "Role",
        apiVersion: "rbac.authorization.k8s.io/v1",
        metadata,
        rules: [],
    };
    _.merge(r, req.roleSpec);
    return r;
}

/**
 * Create role spec for a Kubernetes application.  The
 * `req.rbac.roleSpec` is merged into the spec created by this
 * function using `lodash.merge(default, req.rbac.roleSpec)`.
 *
 * @param req application request
 * @return role resource specification
 */
export async function clusterRoleTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1ClusterRole> {
    const labels = applicationLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        labels,
    });
    const r: Partial<k8s.V1ClusterRole> = {
        kind: "ClusterRole",
        apiVersion: "rbac.authorization.k8s.io/v1",
        metadata,
        rules: [],
    };
    _.merge(r, req.roleSpec);
    return r as k8s.V1ClusterRole;
}
