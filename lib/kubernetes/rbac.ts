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
import { errMsg } from "../support/error";
import {
    appName,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
} from "./request";
import {
    deleteRole,
    upsertRole,
} from "./role";
import {
    deleteRoleBinding,
    upsertRoleBinding,
} from "./roleBinding";
import {
    deleteServiceAccount,
    upsertServiceAccount,
} from "./serviceAccount";

/**
 * Package the RBAC resource specs.
 */
export interface RbacResources {
    role?: k8s.V1Role | k8s.V1ClusterRole;
    roleBinding?: k8s.V1RoleBinding | k8s.V1ClusterRoleBinding;
    serviceAccount?: k8s.V1ServiceAccount;
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
 * @return Kubernetes RBAC resource specs that were created or patched, some may be undefined
 */
export async function upsertRbac(req: KubernetesResourceRequest): Promise<RbacResources> {
    if (req.roleSpec && !req.serviceAccountSpec) {
        req.serviceAccountSpec = {};
    }

    const resources: RbacResources = {};

    if (req.serviceAccountSpec) {
        resources.serviceAccount = await upsertServiceAccount(req);
    }

    if (req.roleSpec) {
        resources.role = await upsertRole(req);
        resources.roleBinding = await upsertRoleBinding(req);
    }

    return resources;
}

/**
 * Delete RBAC resources for this application if they exist.  If the
 * resource does not exist, do nothing.
 *
 * @param req Kuberenetes delete request
 * @return Kuberenetes RBAC resources object with deleted resources, some may be undefined
 */
export async function deleteRbac(req: KubernetesDeleteResourceRequest): Promise<RbacResources> {
    const slug = appName(req);
    const deleted: RbacResources = {};
    const errs: Error[] = [];
    try {
        deleted.roleBinding = await deleteRoleBinding(req);
    } catch (e) {
        e.message = `Failed to delete role binding: ${errMsg(e)}`;
        errs.push(e);
    }
    try {
        deleted.role = await deleteRole(req);
    } catch (e) {
        e.message = `Failed to delete role: ${errMsg(e)}`;
        errs.push(e);
    }
    try {
        deleted.serviceAccount = await deleteServiceAccount(req);
    } catch (e) {
        e.message = `Failed to delete service account: ${errMsg(e)}`;
        errs.push(e);
    }
    if (errs.length > 0) {
        const msg = `Failed to delete RBAC resource(s) for ${slug}': ${errs.map(e => e.message).join("; ")}`;
        logger.error(msg);
        throw new Error(msg);
    }
    return deleted;
}
