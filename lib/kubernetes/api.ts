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
import * as request from "request";
import { requestError } from "../support/error";
import { defaultNamespace } from "./namespace";
import { patchHeaders } from "./patch";
import { logObject } from "./resource";

/** Response from methods that operate on an resource. */
export interface K8sObjectResponse {
    body: k8s.KubernetesObject;
    response: http.IncomingMessage;
}

/** Response from list method. */
export interface K8sListResponse {
    body: k8s.KubernetesListObject<k8s.KubernetesObject>;
    response: http.IncomingMessage;
}

/** Response from delete method. */
export interface K8sDeleteResponse {
    body: k8s.V1Status;
    response: http.IncomingMessage;
}

/** Response from list API method. */
export interface K8sApiResponse {
    body: k8s.V1APIResourceList;
    response: http.IncomingMessage;
}

/** Union type of all response types. */
type K8sRequestResponse = K8sObjectResponse | K8sDeleteResponse | K8sListResponse | K8sApiResponse;

/** Kubernetes API verbs. */
export type K8sApiAction = "create" | "delete" | "list" | "patch" | "read" | "replace";

/**
 * Since https://github.com/kubernetes-client/javascript/issues/52
 * is fixed, this is no longer necessary.
 * @deprecated use k8s.KubernetesObject
 */
export type K8sObject = k8s.KubernetesObject;

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
    public async create(spec: k8s.KubernetesObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions("POST");
        requestOptions.uri += await this.specUriPath(spec, "create");
        requestOptions.body = spec;
        return this.requestPromise(requestOptions) as unknown as K8sObjectResponse;
    }

    /**
     * Delete any Kubernetes resource.
     */
    public async delete(spec: k8s.KubernetesObject, body: any = this.defaultDeleteBody): Promise<K8sDeleteResponse> {
        const requestOptions = this.baseRequestOptions("DELETE");
        requestOptions.uri += await this.specUriPath(spec, "delete");
        requestOptions.body = body;
        return this.requestPromise(requestOptions) as unknown as K8sDeleteResponse;
    }

    /**
     * List any Kubernetes resource.
     */
    public async list(spec: k8s.KubernetesObject): Promise<K8sListResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += await this.specUriPath(spec, "list");
        return this.requestPromise(requestOptions) as unknown as K8sListResponse;
    }

    /**
     * Patch any Kubernetes resource.
     */
    public async patch(spec: k8s.KubernetesObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions("PATCH");
        requestOptions.uri += await this.specUriPath(spec, "patch");
        requestOptions.body = spec;
        requestOptions.headers = {
            ...requestOptions.headers,
            ...patchHeaders(),
        };
        return this.requestPromise(requestOptions) as unknown as K8sObjectResponse;
    }

    /**
     * Read any Kubernetes resource.
     */
    public async read(spec: k8s.KubernetesObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += await this.specUriPath(spec, "read");
        return this.requestPromise(requestOptions) as unknown as K8sObjectResponse;
    }

    /**
     * Replace any Kubernetes resource.
     */
    public async replace(spec: k8s.KubernetesObject): Promise<K8sObjectResponse> {
        const requestOptions = this.baseRequestOptions("PUT");
        requestOptions.uri += await this.specUriPath(spec, "replace");
        requestOptions.body = spec;
        return this.requestPromise(requestOptions) as unknown as K8sObjectResponse;
    }

    /**
     * Get metadata from Kubernetes API for resources described by
     * `kind` and `apiVersion`.  If it is unable to find the resource
     * `kind` under the provided `apiVersion` or an error occurs,
     * `undefined` is returned.
     */
    public async resource(apiVersion: string, kind: string): Promise<k8s.V1APIResource | undefined> {
        try {
            const requestOptions = this.baseRequestOptions();
            const prefix = (apiVersion.includes("/")) ? "apis" : "api";
            requestOptions.uri += [prefix, apiVersion].join("/");
            const getApiResponse = await this.requestPromise(requestOptions);
            const apiResourceList = getApiResponse.body as unknown as k8s.V1APIResourceList;
            return apiResourceList.resources.find(r => r.kind === kind);
        } catch (e) {
            logger.error(`Failed to fetch resource metadata for ${apiVersion}/${kind}: ${e.message}`);
            return undefined;
        }
    }

    /**
     * Use spec information to construct resource URI path.  If any
     * required information in not provided, an Error is thrown.  If an
     * `apiVersion` is not provided, "v1" is used.  If a `metadata.namespace`
     * is not provided for a request that requires one, "default" is used.
     *
     * @param spec resource spec which must kind and apiVersion properties
     * @param action API action, see [[K8sApiAction]]
     * @return tail of resource-specific URI
     */
    public async specUriPath(spec: k8s.KubernetesObject, action: K8sApiAction): Promise<string> {
        if (!spec.kind) {
            throw new Error(`Spec does not contain kind: ${logObject(spec)}`);
        }
        if (!spec.apiVersion) {
            spec.apiVersion = "v1";
            logger.info(`Spec does not contain apiVersion, using "${spec.apiVersion}"`);
        }
        if (!spec.metadata) {
            spec.metadata = {};
        }
        const resource = await this.resource(spec.apiVersion, spec.kind);
        if (!resource) {
            throw new Error(`Unrecognized API version and kind: ${spec.apiVersion} ${spec.kind}`);
        }
        if (namespaceRequired(resource, action) && !spec.metadata.namespace) {
            spec.metadata.namespace = defaultNamespace;
        }
        const prefix = (spec.apiVersion.includes("/")) ? "apis" : "api";
        const parts = [prefix, spec.apiVersion];
        if (resource.namespaced && spec.metadata.namespace) {
            parts.push("namespaces", spec.metadata.namespace);
        }
        parts.push(resource.name);
        if (appendName(action)) {
            if (!spec.metadata.name) {
                throw new Error(`Spec does not contain name: ${logObject(spec)}`);
            }
            parts.push(spec.metadata.name);
        }
        return parts.join("/").toLowerCase();
    }

    /**
     * Generate request options.  Largely copied from @kubernetes/client-node/dist/api.js.
     */
    private baseRequestOptions(method: string = "GET"): request.UriOptions & request.CoreOptions {
        const localVarPath = this.basePath + "/";
        const queryParameters = {};
        const localHeaders = (method === "PATCH") ? patchHeaders().headers : {};
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
    private requestPromise(requestOptions: request.UriOptions & request.CoreOptions): Promise<K8sRequestResponse> {
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

/**
 * Return whether the name of the resource should be appended to the
 * API URI path.  When creating and listing resources, it is not
 * appended.
 *
 * @param action API action, see [[K8sApiAction]]
 * @return true if name should be appended to URI
 */
export function appendName(action: K8sApiAction): boolean {
    return !(action === "create" || action === "list");
}

/**
 * Return whether namespace must be included in resource API URI.
 * It returns true of the resource is namespaced and the action is
 * not "list".  The namespace can be provided when the action is
 * "list", but it need not be.
 *
 * @param resource resource metadata
 * @param action API action, see [[K8sApiAction]]
 * @return true is the namespace is required in the API URI path
 */
export function namespaceRequired(resource: k8s.V1APIResource, action: K8sApiAction): boolean {
    // return action !== "list" || resource.namespaced;
    // return !(action === "list" || !resource.namespaced);
    return resource.namespaced && action !== "list";
}
