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

interface UpsertRoleBindingResponse {
    response: http.IncomingMessage;
    body: k8s.V1RoleBinding | k8s.V1ClusterRoleBinding;
}

/**
 * Create or patch role or cluster rolebinding.
 *
 * @param req Kubernetes application request.
 * @return response from create or patch request
 */
export async function upsertRoleBinding(req: KubernetesResourceRequest): Promise<UpsertRoleBindingResponse> {
    const slug = appName(req);
    if (req.roleSpec.kind === "ClusterRole") {
        const spec = await clusterRoleBindingTemplate(req);
        try {
            await req.clients.rbac.readClusterRoleBinding(req.name);
        } catch (e) {
            logger.debug(`Failed to read cluster role binding ${slug}, creating: ${errMsg(e)}`);
            return logRetry(() => req.clients.rbac.createClusterRoleBinding(spec),
                `create cluster role binding ${slug}`);
        }
        logger.debug(`Cluster role binding ${slug} exists, patching using '${stringify(spec)}'`);
        return logRetry(() => req.clients.rbac.patchClusterRoleBinding(req.name, spec),
            `patch cluster role binding ${slug}`);
    } else {
        const spec = await roleBindingTemplate(req);
        try {
            await req.clients.rbac.readNamespacedRoleBinding(req.name, req.ns);
        } catch (e) {
            logger.debug(`Failed to read role binding ${slug}, creating: ${errMsg(e)}`);
            return logRetry(() => req.clients.rbac.createNamespacedRoleBinding(req.ns, spec),
                `create role binding ${slug}`);
        }
        logger.debug(`Role binding ${slug} exists, patching using '${stringify(spec)}'`);
        return logRetry(() => req.clients.rbac.patchNamespacedRoleBinding(req.name, req.ns, spec),
            `patch role binding ${slug}`);
    }
}

/**
 * Delete Kubernetes application role or cluster role binding.
 *
 * @param req Kuberenetes delete request
 * @return deleted role or cluster role binding object, or undefined if no (cluster) role binding exists
 */
export async function deleteRoleBinding(req: KubernetesDeleteResourceRequest): Promise<k8s.KubernetesObject | undefined> {
    const slug = appName(req);
    let deleted: k8s.KubernetesObject;

    try {
        const resp = await req.clients.rbac.readNamespacedRoleBinding(req.name, req.ns);
        deleted = resp.body;
    } catch (e) {
        logger.debug(`Role binding ${slug} does not exist: ${errMsg(e)}`);
    }
    if (deleted) {
        try {
            await logRetry(() => req.clients.rbac.deleteNamespacedRoleBinding(req.name, req.ns), `delete role binding ${slug}`);
            return deleted;
        } catch (e) {
            e.message = `Failed to delete role binding ${slug}: ${errMsg(e)}`;
            logger.error(e.message);
            throw e;
        }
    }

    try {
        const resp = await req.clients.rbac.readClusterRoleBinding(req.name, req.ns);
        deleted = resp.body;
    } catch (e) {
        logger.debug(`Cluster role binding ${slug} does not exist: ${errMsg(e)}`);
    }
    if (deleted) {
        try {
            await logRetry(() => req.clients.rbac.deleteClusterRoleBinding(req.name, req.ns), `delete cluster role binding ${slug}`);
            return deleted;
        } catch (e) {
            e.message = `Failed to delete cluster role binding ${slug}: ${errMsg(e)}`;
            logger.error(e.message);
            throw e;
        }
    }

    return undefined;
}

/**
 * Create role binding spec for a Kubernetes application.  The
 * `req.rbac.roleBindingSpec`, if it is not false, is merged into the
 * spec created by this function using `lodash.merge(default,
 * req.rbac.roleBindingSpec)`.
 *
 * @param req application request
 * @return role binding resource specification
 */
export async function roleBindingTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1RoleBinding> {
    const labels = applicationLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        labels,
    });
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const rb: DeepPartial<k8s.V1RoleBinding> = {
        kind: "RoleBinding",
        apiVersion: "rbac.authorization.k8s.io/v1",
        metadata,
        roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "Role",
            name: req.name,
        },
        subjects: [
            {
                kind: "ServiceAccount",
                name: req.name,
            },
        ],
    };
    if (req.serviceAccountSpec && req.serviceAccountSpec.metadata && req.serviceAccountSpec.metadata.name) {
        rb.subjects[0].name = req.serviceAccountSpec.metadata.name;
    }
    if (req.roleBindingSpec) {
        _.merge(rb, req.roleBindingSpec);
    }
    return rb as k8s.V1RoleBinding;
}

/**
 * Create cluster role binding spec for a Kubernetes application.  The
 * `req.rbac.roleBindingSpec` is merged into the
 * spec created by this function using `lodash.merge(default,
 * req.rbac.roleBindingSpec)`.
 *
 * @param req application request
 * @return cluster role binding resource specification
 */
export async function clusterRoleBindingTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1ClusterRoleBinding> {
    const labels = applicationLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        labels,
    });
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const rb: DeepPartial<k8s.V1ClusterRoleBinding> = {
        kind: "ClusterRoleBinding",
        apiVersion: "rbac.authorization.k8s.io/v1",
        metadata,
        roleRef: {
            apiGroup: "rbac.authorization.k8s.io",
            kind: "ClusterRole",
            name: req.name,
        },
        subjects: [
            {
                kind: "ServiceAccount",
                name: req.name,
                namespace: req.ns,
            },
        ],
    };
    if (req.serviceAccountSpec && req.serviceAccountSpec.metadata && req.serviceAccountSpec.metadata.name) {
        rb.subjects[0].name = req.serviceAccountSpec.metadata.name;
    }
    if (req.roleBindingSpec) {
        _.merge(rb, req.roleBindingSpec);
    }
    return rb as k8s.V1ClusterRoleBinding;
}
