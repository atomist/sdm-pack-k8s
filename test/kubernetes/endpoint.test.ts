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

import * as assert from "power-assert";
import { endpointBaseUrl } from "../../lib/kubernetes/endpoint";
import { KubernetesApplication } from "../../lib/kubernetes/request";

describe("kubernetes/endpoint", () => {

    describe("endpointBaseUrl", () => {

        it("should return the default", () => {
            const r: KubernetesApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
            };
            const u = endpointBaseUrl(r);
            const e = "http://localhost/";
            assert(u === e);
        });

        it("should return the host and path", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
                protocol: "https" as "https",
            };
            const u = endpointBaseUrl(r);
            const e = `https://emi.com/bush/kate/hounds-of-love/cloudbusting/`;
            assert(u === e);
        });

        it("should return http protocol with no tlsSecret", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const u = endpointBaseUrl(r);
            const e = `http://emi.com/bush/kate/hounds-of-love/cloudbusting/`;
            assert(u === e);
        });

        it("should return https protocol with tslSecret", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
                tlsSecret: "wickham",
            };
            const u = endpointBaseUrl(r);
            const e = `https://emi.com/bush/kate/hounds-of-love/cloudbusting/`;
            assert(u === e);
        });

    });

});
