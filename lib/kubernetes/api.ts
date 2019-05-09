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

import * as k8s from "@kubernetes/client-node";
import * as http from "http";
import * as stringify from "json-stringify-safe";
import * as request from "request";
import { DeepPartial } from "ts-essentials";

export interface KubernetesObjectResponse {
    body: k8s.KubernetesObject;
    response: http.IncomingMessage;
}

export interface KubernetesListResponse {
    body: k8s.KubernetesListObject;
    response: http.IncomingMessage;
}

export interface KubernetesDeleteResponse {
    body: k8s.V1Status;
    response: http.IncomingMessage;
}

/**
 * Dynamically construct Kubernetes API request URIs so client does
 * not have to know what type of object it is acting on, create the
 * appropriate client, and call the appropriate method.
 */
export class KubernetesObjectApi extends k8s.ApisApi {

    private readonly defaultDeleteBody: any = { propagationPolicy: "Background" };

    /**
     * Read any Kubernetes resource.
     */
    public async create(spec: DeepPartial<k8s.KubernetesObject>): Promise<KubernetesObjectResponse> {
        const requestOptions = this.baseRequestOptions("POST");
        requestOptions.uri += specUriPath(spec, false);
        requestOptions.body = spec;
        return this.requestPromise(requestOptions) as any as KubernetesObjectResponse;
    }

    /**
     * Delete any Kubernetes resource.
     */
    public async delete(spec: DeepPartial<k8s.KubernetesObject>, body: any = this.defaultDeleteBody): Promise<KubernetesDeleteResponse> {
        const requestOptions = this.baseRequestOptions("DELETE");
        requestOptions.uri += specUriPath(spec);
        requestOptions.body = body;
        return this.requestPromise(requestOptions) as any as KubernetesDeleteResponse;
    }

    /**
     * List any Kubernetes resource.
     */
    public async list(spec: DeepPartial<k8s.KubernetesObject>): Promise<KubernetesListResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += specUriPath(spec, false);
        return this.requestPromise(requestOptions) as any as KubernetesListResponse;
    }

    /**
     * Patch any Kubernetes resource.
     */
    public async patch(spec: DeepPartial<k8s.KubernetesObject>): Promise<KubernetesObjectResponse> {
        const requestOptions = this.baseRequestOptions("PATCH");
        requestOptions.uri += specUriPath(spec);
        requestOptions.body = spec;
        requestOptions.headers["Content-Type"] = "application/strategic-merge-patch+json";
        return this.requestPromise(requestOptions) as any as KubernetesObjectResponse;
    }

    /**
     * Read any Kubernetes resource.
     */
    public async read(spec: DeepPartial<k8s.KubernetesObject>): Promise<KubernetesObjectResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += specUriPath(spec);
        return this.requestPromise(requestOptions) as any as KubernetesObjectResponse;
    }

    /**
     * Replace any Kubernetes resource.
     */
    public async replace(spec: DeepPartial<k8s.KubernetesObject>): Promise<KubernetesObjectResponse> {
        const requestOptions = this.baseRequestOptions("PUT");
        requestOptions.uri += specUriPath(spec);
        requestOptions.body = spec;
        return this.requestPromise(requestOptions) as any as KubernetesObjectResponse;
    }

    /**
     * Generate request options.  Largely copied from @kubernetes/client-node/dist/api.js.
     */
    private baseRequestOptions(method: string = "GET"): request.UriOptions & request.CoreOptions {
        const localVarPath = this.basePath + "/apis/";
        const queryParameters = {};
        const headerParams = Object.assign({}, this.defaultHeaders);
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
    private requestPromise(requestOptions: request.UriOptions & request.CoreOptions): Promise<KubernetesObjectResponse | KubernetesDeleteResponse> {
        return new Promise((resolve, reject) => {
            request(requestOptions, (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    if (response.statusCode >= 200 && response.statusCode <= 299) {
                        resolve({ response, body });
                    } else {
                        reject({ response, body });
                    }
                }
            });
        });
    }

}

/**
 * Use spec information to construct resource URI path.  If any
 * required information in not provided, an Error is thrown.
 *
 * @param spec resource metadata
 * @param appendName if `true`, append name to path
 * @return tail of resource-specific URI
 */
export function specUriPath(spec: DeepPartial<k8s.KubernetesObject>, appendName: boolean = true): string {
    if (!spec.kind) {
        throw new Error(`Spec does not contain kind: ${stringify(spec)}`);
    }
    if (!spec.apiVersion) {
        throw new Error(`Spec does not contain apiVersion: ${stringify(spec)}`);
    }
    const plural = spec.kind.toLowerCase().replace(/s$/, "se").replace(/y$/, "ie") + "s";
    const parts = (spec.metadata && spec.metadata.namespace) ?
        [spec.apiVersion, "namespaces", spec.metadata.namespace, plural] :
        [spec.apiVersion, plural];
    if (appendName) {
        if ((!spec.metadata || !spec.metadata.name)) {
            throw new Error(`Spec does not contain name: ${stringify(spec)}`);
        }
        parts.push(spec.metadata.name);
    }
    return parts.join("/").toLowerCase();
}
