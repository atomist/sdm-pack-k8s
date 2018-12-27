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

import { KubernetesApplication } from "./request";

/**
 * Create the URL for a deployment using the protocol, host, and tail
 * from the input object.  If host is not provided, use "localhost".  If
 * protocol is not provided, use "https" if tlsSecret is provided,
 * otherwise "http".  A forward slash, /, is appended to the tail even
 * if it is empty.
 *
 * @param ka Kubernetes application
 * @return endpoint URL for deployment service
 */
export function endpointBaseUrl(ka: Pick<KubernetesApplication, "host" | "path" | "protocol" | "tlsSecret">): string {
    const defaultProtocol = (ka.tlsSecret) ? "https" : "http";
    const protocol = (ka.protocol) ? ka.protocol : defaultProtocol;
    const host = (ka.host) ? ka.host : "localhost";
    const tail = (ka.path && ka.path !== "/") ? `${ka.path}/` : "/";
    return `${protocol}://${host}${tail}`;
}
