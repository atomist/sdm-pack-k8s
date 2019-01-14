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
import { DeepPartial } from "ts-essentials";
import { logRetry } from "../support/retry";
import { applicationLabels } from "./labels";
import { metadataTemplate } from "./metadata";
import {
    appName,
    KubernetesApplication,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
} from "./request";

export interface UpsertRbacResponse {
    response: http.IncomingMessage;
    body: k8s.V1Role;
}

/**
 * Create RBAC resources if they do not exist.  If `req.rbac` is
 * false, no resources are created.  If any of the RBAC resources
 * exist and their corresponding partial spec under `req.rbac` is
 * provided, the resource is patched.
 *
 * @param req Kuberenetes application request
 * @return Response from Kubernetes API if role is created or patched,
 *         `void` otherwise.
 */
export async function upsertRbac(req: KubernetesResourceRequest): Promise<UpsertRbacResponse | void> {
    const slug = appName(req);
    if (!req.rbac || !req.rbac.roleSpec) {
        logger.debug(`Role not provided, will not create RBAC resources for ${slug}`);
        return;
    }
    let roleResponse: UpsertRbacResponse;
    try {
        await req.clients.rbac.readNamespacedRole(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read role ${slug}, creating: ${e.message}`);
        const role = await roleTemplate(req);
        logger.debug(`Creating role ${slug} using '${stringify(role)}'`);
        roleResponse = await logRetry(() => req.clients.rbac.createNamespacedRole(req.ns, role), `create role ${slug}`);
    }
    if (!roleResponse) {
        logger.debug(`Role ${slug} exists, patching using '${stringify(req.rbac.roleSpec)}'`);
        roleResponse = await logRetry(() => req.clients.rbac.patchNamespacedRole(req.name, req.ns, req.rbac.roleSpec),
            `patch role ${slug}`);
    }

    let saResponse: { response: http.IncomingMessage, body: k8s.V1ServiceAccount };
    try {
        saResponse = await req.clients.core.readNamespacedServiceAccount(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read service account ${slug}, creating: ${e.message}`);
        const serviceAccount = await serviceAccountTemplate(req);
        await logRetry(() => req.clients.core.createNamespacedServiceAccount(req.ns, serviceAccount),
            `create service account ${slug}`);
    }
    if (!saResponse && req.rbac.serviceAccountSpec) {
        logger.debug(`Service account ${slug} exists, patching using '${stringify(req.rbac.serviceAccountSpec)}'`);
        saResponse = await logRetry(() => req.clients.core.patchNamespacedServiceAccount(req.name, req.ns, req.rbac.serviceAccountSpec),
            `patch service account ${slug}`);
    }

    let rbResponse: { response: http.IncomingMessage, body: k8s.V1RoleBinding };
    try {
        rbResponse = await req.clients.rbac.readNamespacedRoleBinding(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read role binding ${slug}, creating: ${e.message}`);
        const roleBinding = await roleBindingTemplate(req);
        await logRetry(() => req.clients.rbac.createNamespacedRoleBinding(req.ns, roleBinding),
            `create role binding ${slug}`);
    }
    if (!rbResponse && req.rbac.roleBindingSpec) {
        logger.debug(`Role binding ${slug} exists, patching using '${stringify(req.rbac.roleBindingSpec)}'`);
        rbResponse = await logRetry(() => req.clients.rbac.patchNamespacedRoleBinding(req.name, req.ns, req.rbac.roleBindingSpec),
            `patch role binding ${slug}`);
    }

    return roleResponse;
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

    try {
        await req.clients.rbac.readNamespacedRoleBinding(req.name, req.ns);
    } catch (e) {
        logger.debug(`Role binding ${slug} does not exist: ${e.message}`);
        return;
    }
    await logRetry(() => req.clients.rbac.deleteNamespacedRoleBinding(req.name, req.ns, body), `delete role binding ${slug}`);

    try {
        await req.clients.core.readNamespacedServiceAccount(req.name, req.ns);
    } catch (e) {
        logger.debug(`Service account ${slug} does not exist: ${e.message}`);
        return;
    }
    await logRetry(() => req.clients.core.deleteNamespacedServiceAccount(req.name, req.ns, body), `delete service account ${slug}`);

    try {
        await req.clients.rbac.readNamespacedRole(req.name, req.ns);
    } catch (e) {
        logger.debug(`Role ${slug} does not exist: ${e.message}`);
        return;
    }
    await logRetry(() => req.clients.rbac.deleteNamespacedRole(req.name, req.ns, body), `delete role ${slug}`);

    return;
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
    _.merge(r, req.rbac.roleSpec);
    return r;
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
    if (req.rbac.serviceAccountSpec) {
        _.merge(sa, req.rbac.serviceAccountSpec);
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
    if (req.rbac.serviceAccountSpec && req.rbac.serviceAccountSpec.metadata && req.rbac.serviceAccountSpec.metadata.name) {
        rb.subjects[0].name = req.rbac.serviceAccountSpec.metadata.name;
    }
    if (req.rbac.roleBindingSpec) {
        _.merge(rb, req.rbac.roleBindingSpec);
    }
    return rb as k8s.V1RoleBinding;
}
