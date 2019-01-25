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
} from "./request";

/**
 * Package the API responses for all the RBAC resources.
 */
export interface UpsertRbacResponse {
    role?: {
        response: http.IncomingMessage;
        body: k8s.V1Role | k8s.V1ClusterRole;
    };
    roleBinding?: {
        response: http.IncomingMessage;
        body: k8s.V1RoleBinding | k8s.V1ClusterRoleBinding;
    };
    serviceAccount?: {
        response: http.IncomingMessage;
        body: k8s.V1ServiceAccount;
    };
}

/**
 * Create requested RBAC resources if they do not exist.  If
 * `req.roleSpec` is truthy, the service account, role, and binding
 * are created.  If `req.roleSpect` is falsey but
 * `req.serviceAccountSpec` is truthy, only the service account is
 * created.  If any of the RBAC resources exist and their
 * corresponding partial spec is provided in `req`, the resource is
 * patched.
 *
 * @param req Kuberenetes application request
 * @return Response from Kubernetes API if role is created or patched.
 */
export async function upsertRbac(req: KubernetesResourceRequest): Promise<UpsertRbacResponse> {
    if (req.roleSpec && !req.serviceAccountSpec) {
        req.serviceAccountSpec = {};
    }

    const response: UpsertRbacResponse = {};

    if (req.serviceAccountSpec) {
        response.serviceAccount = await upsertServiceAccount(req);
    }

    if (req.roleSpec) {
        response.role = await upsertRole(req);
        response.roleBinding = await upsertRoleBinding(req);
    }

    return response;
}

/**
 * Delete RBAC resources for this application if they exist.  If the
 * resource does not exist, do nothing.
 *
 * @param req Kuberenetes delete request
 */
export async function deleteRbac(req: KubernetesDeleteResourceRequest): Promise<void> {
    const slug = appName(req);
    const body: k8s.V1DeleteOptions = {} as any;
    const errs: Error[] = [];

    let roleBindingExists = false;
    try {
        await req.clients.rbac.readNamespacedRoleBinding(req.name, req.ns);
        roleBindingExists = true;
    } catch (e) {
        logger.debug(`Role binding ${slug} does not exist: ${errMsg(e)}`);
    }
    if (roleBindingExists) {
        try {
            await logRetry(() => req.clients.rbac.deleteNamespacedRoleBinding(req.name, req.ns, body), `delete role binding ${slug}`);
        } catch (e) {
            e.message = `Failed to delete role binding ${slug}: ${errMsg(e)}`;
            errs.push(e);
        }
    }

    let serviceAccountExists = false;
    try {
        await req.clients.core.readNamespacedServiceAccount(req.name, req.ns);
        serviceAccountExists = true;
    } catch (e) {
        logger.debug(`Service account ${slug} does not exist: ${errMsg(e)}`);
    }
    if (serviceAccountExists) {
        try {
            await logRetry(() => req.clients.core.deleteNamespacedServiceAccount(req.name, req.ns, body), `delete service account ${slug}`);
        } catch (e) {
            e.message = `Failed to delete service account ${slug}: ${errMsg(e)}`;
            errs.push(e);
        }
    }

    let roleExists = false;
    try {
        await req.clients.rbac.readNamespacedRole(req.name, req.ns);
        roleExists = true;
    } catch (e) {
        logger.debug(`Role ${slug} does not exist: ${errMsg(e)}`);
    }
    if (roleExists) {
        try {
            await logRetry(() => req.clients.rbac.deleteNamespacedRole(req.name, req.ns, body), `delete role ${slug}`);
        } catch (e) {
            e.message = `Failed to delete role ${slug}: ${errMsg(e)}`;
            errs.push(e);
        }
    }

    if (errs.length > 0) {
        const msg = `Failed to delete RBAC resource(s) for ${slug}': ${errs.map(e => e.message).join("; ")}`;
        logger.error(msg);
        throw new Error(msg);
    }

    return;
}

interface UpsertServiceAccountResponse {
    response: http.IncomingMessage;
    body: k8s.V1ServiceAccount;
}

/** Create or patch service account. */
async function upsertServiceAccount(req: KubernetesResourceRequest): Promise<UpsertServiceAccountResponse> {
    const slug = appName(req);
    try {
        await req.clients.core.readNamespacedServiceAccount(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read service account ${slug}, creating: ${errMsg(e)}`);
        const spec = await serviceAccountTemplate(req);
        return logRetry(() => req.clients.core.createNamespacedServiceAccount(req.ns, spec),
            `create service account ${slug}`);
    }
    logger.debug(`Service account ${slug} exists, patching using '${stringify(req.serviceAccountSpec)}'`);
    return logRetry(() => req.clients.core.patchNamespacedServiceAccount(req.name, req.ns, req.serviceAccountSpec),
        `patch service account ${slug}`);
}

interface UpsertRoleResponse {
    response: http.IncomingMessage;
    body: k8s.V1Role | k8s.V1ClusterRole;
}

/** Create or patch role or cluster role. */
async function upsertRole(req: KubernetesResourceRequest): Promise<UpsertRoleResponse> {
    const slug = appName(req);
    try {
        if (req.roleSpec.kind === "ClusterRole") {
            await req.clients.rbac.readClusterRole(req.name);
        } else {
            await req.clients.rbac.readNamespacedRole(req.name, req.ns);
        }
    } catch (e) {
        if (req.roleSpec.kind === "ClusterRole") {
            logger.debug(`Failed to read cluster role ${slug}, creating: ${errMsg(e)}`);
            const spec = await clusterRoleTemplate(req);
            logger.debug(`Creating cluster role ${slug} using '${stringify(spec)}'`);
            return logRetry(() => req.clients.rbac.createClusterRole(spec), `create cluster role ${slug}`);
        } else {
            logger.debug(`Failed to read role ${slug}, creating: ${errMsg(e)}`);
            const spec = await roleTemplate(req);
            return logRetry(() => req.clients.rbac.createNamespacedRole(req.ns, spec), `create role ${slug}`);
        }
    }
    if (req.roleSpec.kind === "ClusterRole") {
        logger.debug(`Cluster role ${slug} exists, patching using '${stringify(req.roleSpec)}'`);
        return logRetry(() => req.clients.rbac.patchClusterRole(req.name, req.roleSpec),
            `patch cluster role ${slug}`);
    } else {
        logger.debug(`Role ${slug} exists, patching using '${stringify(req.roleSpec)}'`);
        return logRetry(() => req.clients.rbac.patchNamespacedRole(req.name, req.ns, req.roleSpec),
            `patch role ${slug}`);
    }
}

interface UpsertRoleBindingResponse {
    response: http.IncomingMessage;
    body: k8s.V1RoleBinding | k8s.V1ClusterRoleBinding;
}

/** Create or patch role binding. */
async function upsertRoleBinding(req: KubernetesResourceRequest): Promise<UpsertRoleBindingResponse> {
    const slug = appName(req);
    try {
        if (req.roleSpec.kind === "ClusterRole") {
            await req.clients.rbac.readClusterRoleBinding(req.name);
        } else {
            await req.clients.rbac.readNamespacedRoleBinding(req.name, req.ns);
        }
    } catch (e) {
        if (req.roleSpec.kind === "ClusterRole") {
            logger.debug(`Failed to read cluster role binding ${slug}, creating: ${errMsg(e)}`);
            const spec = await clusterRoleBindingTemplate(req);
            return logRetry(() => req.clients.rbac.createClusterRoleBinding(spec),
                `create cluster role binding ${slug}`);
        } else {
            logger.debug(`Failed to read role binding ${slug}, creating: ${errMsg(e)}`);
            const spec = await roleBindingTemplate(req);
            return logRetry(() => req.clients.rbac.createNamespacedRoleBinding(req.ns, spec),
                `create role binding ${slug}`);
        }
    }
    if (req.roleSpec.kind === "ClusterRole") {
        logger.debug(`Cluster role binding ${slug} exists, patching using '${stringify(req.roleBindingSpec)}'`);
        return logRetry(() => req.clients.rbac.patchClusterRoleBinding(req.name, req.roleBindingSpec),
            `patch cluster role binding ${slug}`);
    } else {
        logger.debug(`Role binding ${slug} exists, patching using '${stringify(req.roleBindingSpec)}'`);
        return logRetry(() => req.clients.rbac.patchNamespacedRoleBinding(req.name, req.ns, req.roleBindingSpec),
            `patch role binding ${slug}`);
    }
}

/**
 * Create role spec for a Kubernetes application.  The
 * `req.rbac.roleSpec` is merged into the spec created by this
 * function using `lodash.merge(default, req.rbac.roleSpec)`.
 *
 * @param req application request
 * @return role resource specification
 */
export async function roleTemplate(req: KubernetesApplication): Promise<k8s.V1Role> {
    const labels = await applicationLabels(req);
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
export async function clusterRoleTemplate(req: KubernetesApplication): Promise<k8s.V1ClusterRole> {
    const labels = await applicationLabels(req);
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

/**
 * Create service account spec for a Kubernetes application.  The
 * `req.rbac.serviceAccountSpec`, if it not false, is merged into the
 * spec created by this function using `lodash.merge(default,
 * req.rbac.serviceAccountSpec)`.
 *
 * @param req application request
 * @return service account resource specification
 */
export async function serviceAccountTemplate(req: KubernetesApplication): Promise<k8s.V1ServiceAccount> {
    const labels = await applicationLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
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

/**
 * Create role binding spec for a Kubernetes application.  The
 * `req.rbac.roleBindingSpec`, if it is not false, is merged into the
 * spec created by this function using `lodash.merge(default,
 * req.rbac.roleBindingSpec)`.
 *
 * @param req application request
 * @return role binding resource specification
 */
export async function roleBindingTemplate(req: KubernetesApplication): Promise<k8s.V1RoleBinding> {
    const labels = await applicationLabels(req);
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
export async function clusterRoleBindingTemplate(req: KubernetesApplication): Promise<k8s.V1ClusterRoleBinding> {
    const labels = await applicationLabels(req);
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
