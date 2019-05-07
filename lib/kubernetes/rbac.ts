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
 * @return array of deleted objects, which may be empty
 */
export async function deleteRbac(req: KubernetesDeleteResourceRequest): Promise<k8s.KubernetesObject[]> {
    const slug = appName(req);
    const deleted: k8s.KubernetesObject[] = [];
    const errs: Error[] = [];
    for (const deleteOp of [deleteRoleBinding, deleteServiceAccount, deleteRole]) {
        try {
            deleted.push(await deleteOp(req));
        } catch (e) {
            errs.push(e);
        }
    }
    if (errs.length > 0) {
        const msg = `Failed to delete RBAC resource(s) for ${slug}': ${errs.map(e => e.message).join("; ")}`;
        logger.error(msg);
        throw new Error(msg);
    }
    return deleted.filter(d => !!d);
}
