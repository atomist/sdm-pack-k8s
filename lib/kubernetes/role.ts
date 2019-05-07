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

interface UpsertRoleResponse {
    response: http.IncomingMessage;
    body: k8s.V1Role | k8s.V1ClusterRole;
}

/**
 * Create or patch role or cluster role.
 *
 * @param req Kubernetes application request.
 * @return response from create or patch request
 */
export async function upsertRole(req: KubernetesResourceRequest): Promise<UpsertRoleResponse> {
    const slug = appName(req);
    if (req.roleSpec.kind === "ClusterRole") {
        const spec = await clusterRoleTemplate(req);
        try {
            await req.clients.rbac.readClusterRole(req.name);
        } catch (e) {
            logger.debug(`Failed to read cluster role ${slug}, creating: ${errMsg(e)}`);
            logger.debug(`Creating cluster role ${slug} using '${stringify(spec)}'`);
            return logRetry(() => req.clients.rbac.createClusterRole(spec), `create cluster role ${slug}`);
        }
        logger.debug(`Cluster role ${slug} exists, patching using '${stringify(spec)}'`);
        return logRetry(() => req.clients.rbac.patchClusterRole(req.name, spec), `patch cluster role ${slug}`);
    } else {
        const spec = await roleTemplate(req);
        try {
            await req.clients.rbac.readNamespacedRole(req.name, req.ns);
        } catch (e) {
            logger.debug(`Failed to read role ${slug}, creating: ${errMsg(e)}`);
            return logRetry(() => req.clients.rbac.createNamespacedRole(req.ns, spec), `create role ${slug}`);
        }
        logger.debug(`Role ${slug} exists, patching using '${stringify(spec)}'`);
        return logRetry(() => req.clients.rbac.patchNamespacedRole(req.name, req.ns, spec), `patch role ${slug}`);
    }
}

/**
 * Delete Kubernetes application role or cluster role.
 *
 * @param req Kuberenetes delete request
 * @return deleted role or cluster role object, or undefined if no (cluster) role exists
 */
export async function deleteRole(req: KubernetesDeleteResourceRequest): Promise<k8s.KubernetesObject | undefined> {
    const slug = appName(req);
    let deleted: k8s.KubernetesObject;

    try {
        const resp = await req.clients.rbac.readNamespacedRole(req.name, req.ns);
        deleted = resp.body;
    } catch (e) {
        logger.debug(`Role ${slug} does not exist: ${errMsg(e)}`);
    }
    if (deleted) {
        try {
            await logRetry(() => req.clients.rbac.deleteNamespacedRole(req.name, req.ns), `delete role ${slug}`);
            return deleted;
        } catch (e) {
            e.message = `Failed to delete role ${slug}: ${errMsg(e)}`;
            logger.error(e.message);
            throw e;
        }
    }

    try {
        const resp = await req.clients.rbac.readClusterRole(req.name, req.ns);
        deleted = resp.body;
    } catch (e) {
        logger.debug(`Cluster role ${slug} does not exist: ${errMsg(e)}`);
    }
    if (deleted) {
        try {
            await logRetry(() => req.clients.rbac.deleteClusterRole(req.name, req.ns), `delete cluster role ${slug}`);
            return deleted;
        } catch (e) {
            e.message = `Failed to delete cluster role ${slug}: ${errMsg(e)}`;
            logger.error(e.message);
            throw e;
        }
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
