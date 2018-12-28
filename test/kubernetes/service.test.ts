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
import { serviceTemplate } from "../../lib/kubernetes/service";
import { pkgInfo } from "./pkg";

describe("kubernetes/service", () => {

    describe("serviceTemplate", () => {

        let pv: string;
        before(async () => {
            pv = await pkgInfo();
        });

        it("should create a service spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
            };
            const s = await serviceTemplate(r);
            const e = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                spec: {
                    ports: [
                        {
                            name: "http",
                            port: 5510,
                            protocol: "TCP",
                            targetPort: "http",
                        },
                    ],
                    selector: {
                        "app.kubernetes.io/name": r.name,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                    sessionAffinity: "None",
                    type: "NodePort",
                },
            };
            assert.deepStrictEqual(s, e);
        });

        it("should merge in provided service spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                serviceSpec: {
                    metadata: {
                        annotation: {
                            "music.com/genre": "Art Rock",
                        },
                        labels: {
                            "emi.com/producer": "Kate Bush",
                        },
                    },
                    spec: {
                        externalTrafficPolicy: "Local",
                        sessionAffinity: "ClusterIP",
                    },
                } as any,
            };
            const s = await serviceTemplate(r);
            const e = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    annotation: {
                        "music.com/genre": "Art Rock",
                    },
                    name: r.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "atomist.com/environment": r.environment,
                        "atomist.com/workspaceId": r.workspaceId,
                        "emi.com/producer": "Kate Bush",
                    },
                },
                spec: {
                    externalTrafficPolicy: "Local",
                    ports: [
                        {
                            name: "http",
                            port: 5510,
                            protocol: "TCP",
                            targetPort: "http",
                        },
                    ],
                    selector: {
                        "app.kubernetes.io/name": r.name,
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                    sessionAffinity: "ClusterIP",
                    type: "NodePort",
                },
            };
            assert.deepStrictEqual(s, e);
        });

    });

});
