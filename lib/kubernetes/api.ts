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
import * as request from "request";

export interface ObjectResponse {
    body: k8s.KubernetesObject;
    response: http.IncomingMessage;
}

export interface DeleteResponse {
    body: k8s.V1Status;
    response: http.IncomingMessage;
}

export class KubernetesObjectApi extends k8s.ApisApi {

    /**
     * Read any Kubernetes resource.
     */
    public async read(spec: k8s.KubernetesObject): Promise<ObjectResponse> {
        const requestOptions = this.baseRequestOptions();
        requestOptions.uri += specUriPath(spec);
        return this.requestPromise(requestOptions) as unknown as ObjectResponse;
    }

    /**
     * Delete any Kubernetes resource.
     */
    public async delete(spec: k8s.KubernetesObject, body: any = { propagationPolicy: "Background" }): Promise<DeleteResponse> {
        const requestOptions = this.baseRequestOptions("DELETE");
        requestOptions.uri += specUriPath(spec);
        requestOptions.body = body;
        return this.requestPromise(requestOptions) as unknown as DeleteResponse;
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
    private requestPromise(requestOptions: request.UriOptions & request.CoreOptions): Promise<ObjectResponse | DeleteResponse> {
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
 * Use spec information to construct resource URI path.
 */
export function specUriPath(spec: k8s.KubernetesObject): string {
    const plural = spec.kind.toLowerCase().replace(/s$/, "se").replace(/y$/, "ie") + "s";
    const parts = (spec.metadata.namespace) ?
        [spec.apiVersion, "namespaces", spec.metadata.namespace, plural, spec.metadata.name] :
        [spec.apiVersion, plural, spec.metadata.name];
    return parts.join("/").toLowerCase();
}
