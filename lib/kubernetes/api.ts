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
import * as request from "request";
import { DeepPartial } from "ts-essentials";
import { requestError } from "../support/error";
import { defaultNamespace } from "./namespace";

export interface K8sObjectResponse {
    body: k8s.KubernetesObject;
    response: http.IncomingMessage;
}

export interface K8sListResponse {
    body: k8s.KubernetesListObject<k8s.KubernetesObject>;
    response: http.IncomingMessage;
}

export interface K8sDeleteResponse {
    body: k8s.V1Status;
    response: http.IncomingMessage;
}

// avoid https://github.com/kubernetes-client/javascript/issues/52
export type K8sObject = DeepPartial<k8s.KubernetesObject>;

/**
 * Dynamically construct Kubernetes API request URIs so client does
 * not have to know what type of object it is acting on, create the
 * appropriate client, and call the appropriate method.
 */
export class K8sObjectApi extends k8s.ApisApi {

    private readonly defaultDeleteBody: any = { propagationPolicy: "Background" };

    /**
     * Read any Kubernetes resource.
     */
    public async create(spec: K8sObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions("POST");
        requestOptions.uri += specUriPath(spec, "create");
        requestOptions.body = spec;
        return this.requestPromise(requestOptions) as any as K8sObjectResponse;
    }

    /**
     * Delete any Kubernetes resource.
     */
    public async delete(spec: K8sObject, body: any = this.defaultDeleteBody): Promise<K8sDeleteResponse> {
        const requestOptions = this.baseRequestOptions("DELETE");
        requestOptions.uri += specUriPath(spec, "delete");
        requestOptions.body = body;
        return this.requestPromise(requestOptions) as any as K8sDeleteResponse;
    }

    /**
     * List any Kubernetes resource.
     */
    public async list(spec: K8sObject): Promise<K8sListResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += specUriPath(spec, "list");
        return this.requestPromise(requestOptions) as any as K8sListResponse;
    }

    /**
     * Patch any Kubernetes resource.
     */
    public async patch(spec: K8sObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions("PATCH");
        requestOptions.uri += specUriPath(spec, "patch");
        requestOptions.body = spec;
        requestOptions.headers["Content-Type"] = "application/strategic-merge-patch+json";
        return this.requestPromise(requestOptions) as any as K8sObjectResponse;
    }

    /**
     * Read any Kubernetes resource.
     */
    public async read(spec: K8sObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += specUriPath(spec, "read");
        return this.requestPromise(requestOptions) as any as K8sObjectResponse;
    }

    /**
     * Replace any Kubernetes resource.
     */
    public async replace(spec: K8sObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions("PUT");
        requestOptions.uri += specUriPath(spec, "replace");
        requestOptions.body = spec;
        return this.requestPromise(requestOptions) as any as K8sObjectResponse;
    }

    /**
     * Generate request options.  Largely copied from @kubernetes/client-node/dist/api.js.
     */
    private baseRequestOptions(method: string = "GET"): request.UriOptions & request.CoreOptions {
        const localVarPath = this.basePath + "/";
        const queryParameters = {};
        const localHeaders = (method === "PATCH") ? { "Content-Type": "application/strategic-merge-patch+json" } : {};
        const headerParams = Object.assign({}, this.defaultHeaders, localHeaders);
        const requestOptions = {
            method,
            qs: queryParameters,
            headers: headerParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
        };
        this.authentications.BearerToken.applyToRequest(requestOptions);
        this.authentications.default.applyToRequest(requestOptions);
        return requestOptions;
    }

    /**
     * Wrap request in a Promise.  Largely copied from @kubernetes/client-node/dist/api.js.
     */
    private requestPromise(requestOptions: request.UriOptions & request.CoreOptions): Promise<K8sObjectResponse | K8sDeleteResponse> {
        return new Promise((resolve, reject) => {
            request(requestOptions, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    if (response.statusCode >= 200 && response.statusCode <= 299) {
                        resolve({ response, body });
                    } else {
                        reject(requestError({ response, body }));
                    }
                }
            });
        });
    }

}

/** Options for creating a Kubernetes resource API path from a spec. */
export interface SpecUriPathOptions {
    /** If true, append resource name to URL path. */
    appendName?: boolean;
    /** If true, ensure path contains a namespace. */
    namespaceRequired?: boolean;
}

export type K8sApiAction = "create" | "delete" | "list" | "patch" | "read" | "replace";

/**
 * Generate proper [[SpecUriPathOptions]] from API action and resource kind.
 *
 * @param action API HTTP action
 * @param kind Kubernetes resource kind
 * @return Kubernetes API URI path generation options
 */
export function uriOpts(action: K8sApiAction, kind: string): SpecUriPathOptions {
    const appendName = (action === "create" || action === "list") ? false : true;
    const namespaceRequired = !(action === "list" || isClusterResource(action, kind));
    return { appendName, namespaceRequired };
}

export function isClusterResource(action: K8sApiAction, kind: string): boolean {
    const clusterResources = [
        "APIService",
        "AuditSink",
        "CertificateSigningRequest",
        "ClusterCustomObject",
        "ClusterRole",
        "ClusterRoleBinding",
        "CustomResourceDefinition",
        "InitializerConfiguration",
        "MutatingWebhookConfiguration",
        "Namespace",
        "Node",
        "PersistentVolume",
        "PodSecurityPolicy",
        "PriorityClass",
        "SelfSubjectAccessReview",
        "SelfSubjectRulesReview",
        "StorageClass",
        "SubjectAccessReview",
        "TokenReview",
        "ValidatingWebhookConfiguration",
        "VolumeAttachment",
    ];
    const clusterStatuses = [
        "APIServiceStatus",
        "CertificateSigningRequestStatus",
        "CustomResourceDefinitionStatus",
        "NamespaceStatus",
        "NodeStatus",
        "PersistentVolumeStatus",
        "VolumeAttachmentStatus",
    ];
    if (clusterResources.includes(kind)) {
        return true;
    } else if (action === "patch" || action === "replace") {
        return clusterStatuses.includes(kind);
    } else if (action === "read") {
        return [...clusterStatuses, "ComponentStatus"].includes(kind);
    } else if (action === "list" && kind === "ComponentStatus") {
        return true;
    }
    return false;
}

/**
 * Use spec information to construct resource URI path.  If any
 * required information in not provided, an Error is thrown.  If an
 * `apiVersion` is not provided, "v1" is used.  If a `metadata.namespace`
 * is not provided for a request that requires one, "default" is used.
 *
 * @param spec resource metadata
 * @param appendName if `true`, append name to path
 * @return tail of resource-specific URI
 */
export function specUriPath(spec: K8sObject, action: K8sApiAction): string {
    if (!spec.kind) {
        throw new Error(`Spec does not contain kind: ${stringify(spec)}`);
    }
    if (!spec.apiVersion) {
        spec.apiVersion = "v1";
        logger.info(`Spec does not contain apiVersion, using "${spec.apiVersion}"`);
    }
    if (!spec.metadata) {
        spec.metadata = {};
    }
    const opts = uriOpts(action, spec.kind);
    if (opts.namespaceRequired && !spec.metadata.namespace) {
        spec.metadata.namespace = defaultNamespace;
    }
    const plural = spec.kind.toLowerCase().replace(/s$/, "se").replace(/y$/, "ie") + "s";
    const prefix = (spec.apiVersion.includes("/")) ? "apis" : "api";
    const parts = [prefix, spec.apiVersion];
    if (spec.metadata.namespace) {
        parts.push("namespaces", spec.metadata.namespace);
    }
    parts.push(plural);
    if (opts.appendName) {
        if (!spec.metadata.name) {
            throw new Error(`Spec does not contain name: ${stringify(spec)}`);
        }
        parts.push(spec.metadata.name);
    }
    return parts.join("/").toLowerCase();
}
