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

import * as os from "os";
import * as path from "path";
import * as assert from "power-assert";

import * as k8 from "kubernetes-client";
import {
    deploymentPatch,
    deploymentTemplate,
    endpointBaseUrl,
    Ingress,
    ingressPatch,
    ingressRemove,
    ingressTemplate,
    KubeApplication,
    serviceTemplate,
} from "../lib/support/api";

describe("k8", () => {

    describe("getKubeConfig", () => {
        const cfgPath = process.env.KUBECONFIG || path.join(os.homedir(), ".kube", "config");
        const kubeconfig = k8.config.loadKubeconfig(cfgPath);
        kubeconfig.contexts.forEach((c: any) => {
            console.log(c);
        });
        const k8Config = k8.config.fromKubeconfig(kubeconfig, "minikube");
        console.log(k8Config);
    });

    describe("deploymentPatch", () => {

        it("should create a simple deployment patch", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
            };
            const d = deploymentPatch(req);
            const e = {
                spec: {
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                },
                            ],
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create a custom deployment patch", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                deploymentSpec:
                    `{"spec":{"revisionHistoryLimit":5,"template":{"spec":{"dnsPolicy":"ClusterFirstWithHostNet"}}}}`,
            };
            const d = deploymentPatch(req);
            const e = {
                spec: {
                    revisionHistoryLimit: 5,
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                },
                            ],
                            dnsPolicy: "ClusterFirstWithHostNet",
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create a deployment patch with replicas", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                replicas: 12,
            };
            const d = deploymentPatch(req);
            const e = {
                spec: {
                    replicas: req.replicas,
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                },
                            ],
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create a custom replicas deployment patch", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                // tslint:disable-next-line:max-line-length
                deploymentSpec: `{"spec":{"replicas":2,"revisionHistoryLimit":5,"template":{"spec":{"dnsPolicy":"ClusterFirstWithHostNet"}}}}`,
                replicas: 12,
            };
            const d = deploymentPatch(req);
            const e = {
                spec: {
                    replicas: 2,
                    revisionHistoryLimit: 5,
                    template: {
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                },
                            ],
                            dnsPolicy: "ClusterFirstWithHostNet",
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

    });

    describe("deploymentTemplate", () => {

        it("should create a deployment spec", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                imagePullSecret: "comfort",
                port: 5510,
            };
            const d = deploymentTemplate(req);
            assert(d.kind === "Deployment");
            assert(d.metadata.name === req.name);
            assert(d.metadata.labels.app === req.name);
            assert(d.metadata.labels.workspaceId === req.workspaceId);
            assert(d.spec.replicas === 1);
            assert(d.spec.revisionHistoryLimit === 3);
            assert(d.spec.selector.matchLabels.app === req.name);
            assert(d.spec.selector.matchLabels.workspaceId === req.workspaceId);
            assert(d.spec.template.metadata.annotations["atomist.com/k8vent"] ===
                `{"environment":"new-wave","webhooks":["https://webhook.atomist.com/atomist/kube/teams/KAT3BU5H"]}`);
            assert(d.spec.template.metadata.labels.app === req.name);
            assert(d.spec.template.metadata.labels.workspaceId === req.workspaceId);
            assert(d.spec.template.metadata.name === req.name);
            assert(d.spec.template.spec.containers.length === 1);
            assert(d.spec.template.spec.containers[0].name === req.name);
            assert(d.spec.template.spec.containers[0].image === req.image);
            assert(d.spec.template.spec.containers[0].ports.length === 1);
            assert(d.spec.template.spec.containers[0].ports[0].name === "http");
            assert(d.spec.template.spec.containers[0].ports[0].containerPort === req.port);
            assert(d.spec.template.spec.containers[0].ports[0].protocol === "TCP");
            assert(d.spec.template.spec.containers[0].readinessProbe.httpGet.path === "/");
            assert(d.spec.template.spec.containers[0].readinessProbe.httpGet.port === "http");
            assert(d.spec.template.spec.containers[0].readinessProbe.httpGet.scheme === "HTTP");
            assert(d.spec.template.spec.containers[0].readinessProbe.initialDelaySeconds === 30);
            assert(d.spec.template.spec.containers[0].readinessProbe.timeoutSeconds === 3);
            assert(d.spec.template.spec.containers[0].readinessProbe.periodSeconds === 10);
            assert(d.spec.template.spec.containers[0].readinessProbe.successThreshold === 1);
            assert(d.spec.template.spec.containers[0].readinessProbe.failureThreshold === 3);
            assert(d.spec.template.spec.containers[0].livenessProbe.httpGet.path === "/");
            assert(d.spec.template.spec.containers[0].livenessProbe.httpGet.port === "http");
            assert(d.spec.template.spec.containers[0].livenessProbe.httpGet.scheme === "HTTP");
            assert(d.spec.template.spec.containers[0].livenessProbe.initialDelaySeconds === 30);
            assert(d.spec.template.spec.containers[0].livenessProbe.timeoutSeconds === 3);
            assert(d.spec.template.spec.containers[0].livenessProbe.periodSeconds === 10);
            assert(d.spec.template.spec.containers[0].livenessProbe.successThreshold === 1);
            assert(d.spec.template.spec.containers[0].livenessProbe.failureThreshold === 3);
            assert(d.spec.template.spec.dnsPolicy === "ClusterFirst");
            assert(d.spec.template.spec.restartPolicy === "Always");
            assert(d.spec.template.spec.imagePullSecrets[0].name === req.imagePullSecret);
        });

        it("should create a custom deployment spec", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                imagePullSecret: "comfort",
                port: 5510,
                // tslint:disable-next-line:max-line-length
                deploymentSpec: `{"spec":{"replicas":2,"revisionHistoryLimit":5,"template":{"spec":{"dnsPolicy":"ClusterFirstWithHostNet"}}}}`,
                replicas: 12,
            };
            const d = deploymentTemplate(req);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Deployment",
                metadata: {
                    name: req.name,
                    labels: {
                        app: req.name,
                        workspaceId: req.workspaceId,
                        env: req.environment,
                        creator: "atomist.k8-automation",
                    },
                },
                spec: {
                    replicas: 2,
                    revisionHistoryLimit: 5,
                    selector: {
                        matchLabels: {
                            app: req.name,
                            workspaceId: req.workspaceId,
                        },
                    },
                    template: {
                        metadata: {
                            name: req.name,
                            labels: {
                                app: req.name,
                                workspaceId: req.workspaceId,
                                env: req.environment,
                                creator: "atomist.k8-automation",
                            },
                            annotations: {
                                // tslint:disable-next-line:max-line-length
                                "atomist.com/k8vent": `{"environment":"${req.environment}","webhooks":["https://webhook.atomist.com/atomist/kube/teams/${req.workspaceId}"]}`,
                            },
                        },
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                    imagePullPolicy: "IfNotPresent",
                                    resources: {
                                        limits: {
                                            cpu: "1000m",
                                            memory: "384Mi",
                                        },
                                        requests: {
                                            cpu: "100m",
                                            memory: "320Mi",
                                        },
                                    },
                                    readinessProbe: {
                                        httpGet: {
                                            path: "/",
                                            port: "http",
                                            scheme: "HTTP",
                                        },
                                        initialDelaySeconds: 30,
                                        timeoutSeconds: 3,
                                        periodSeconds: 10,
                                        successThreshold: 1,
                                        failureThreshold: 3,
                                    },
                                    livenessProbe: {
                                        httpGet: {
                                            path: "/",
                                            port: "http",
                                            scheme: "HTTP",
                                        },
                                        initialDelaySeconds: 30,
                                        timeoutSeconds: 3,
                                        periodSeconds: 10,
                                        successThreshold: 1,
                                        failureThreshold: 3,
                                    },
                                    ports: [
                                        {
                                            name: "http",
                                            containerPort: req.port,
                                            protocol: "TCP",
                                        },
                                    ],
                                },
                            ],
                            dnsPolicy: "ClusterFirstWithHostNet",
                            restartPolicy: "Always",
                            imagePullSecrets: [
                                {
                                    name: req.imagePullSecret,
                                },
                            ],
                        },
                    },
                    strategy: {
                        type: "RollingUpdate",
                        rollingUpdate: {
                            maxUnavailable: 0,
                            maxSurge: 1,
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create a deployment spec with zero replicas", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                imagePullSecret: "comfort",
                port: 5510,
                replicas: 0,
            };
            const d = deploymentTemplate(req);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Deployment",
                metadata: {
                    name: req.name,
                    labels: {
                        app: req.name,
                        workspaceId: req.workspaceId,
                        env: req.environment,
                        creator: "atomist.k8-automation",
                    },
                },
                spec: {
                    replicas: 0,
                    revisionHistoryLimit: 3,
                    selector: {
                        matchLabels: {
                            app: req.name,
                            workspaceId: req.workspaceId,
                        },
                    },
                    template: {
                        metadata: {
                            name: req.name,
                            labels: {
                                app: req.name,
                                workspaceId: req.workspaceId,
                                env: req.environment,
                                creator: "atomist.k8-automation",
                            },
                            annotations: {
                                // tslint:disable-next-line:max-line-length
                                "atomist.com/k8vent": `{"environment":"${req.environment}","webhooks":["https://webhook.atomist.com/atomist/kube/teams/${req.workspaceId}"]}`,
                            },
                        },
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                    imagePullPolicy: "IfNotPresent",
                                    resources: {
                                        limits: {
                                            cpu: "1000m",
                                            memory: "384Mi",
                                        },
                                        requests: {
                                            cpu: "100m",
                                            memory: "320Mi",
                                        },
                                    },
                                    readinessProbe: {
                                        httpGet: {
                                            path: "/",
                                            port: "http",
                                            scheme: "HTTP",
                                        },
                                        initialDelaySeconds: 30,
                                        timeoutSeconds: 3,
                                        periodSeconds: 10,
                                        successThreshold: 1,
                                        failureThreshold: 3,
                                    },
                                    livenessProbe: {
                                        httpGet: {
                                            path: "/",
                                            port: "http",
                                            scheme: "HTTP",
                                        },
                                        initialDelaySeconds: 30,
                                        timeoutSeconds: 3,
                                        periodSeconds: 10,
                                        successThreshold: 1,
                                        failureThreshold: 3,
                                    },
                                    ports: [
                                        {
                                            name: "http",
                                            containerPort: req.port,
                                            protocol: "TCP",
                                        },
                                    ],
                                },
                            ],
                            dnsPolicy: "ClusterFirst",
                            restartPolicy: "Always",
                            imagePullSecrets: [
                                {
                                    name: req.imagePullSecret,
                                },
                            ],
                        },
                    },
                    strategy: {
                        type: "RollingUpdate",
                        rollingUpdate: {
                            maxUnavailable: 0,
                            maxSurge: 1,
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

        it("should create a deployment spec with custom replicas", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                replicas: 12,
            };
            const d = deploymentTemplate(req);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Deployment",
                metadata: {
                    name: req.name,
                    labels: {
                        app: req.name,
                        workspaceId: req.workspaceId,
                        env: req.environment,
                        creator: "atomist.k8-automation",
                    },
                },
                spec: {
                    replicas: 12,
                    revisionHistoryLimit: 3,
                    selector: {
                        matchLabels: {
                            app: req.name,
                            workspaceId: req.workspaceId,
                        },
                    },
                    template: {
                        metadata: {
                            name: req.name,
                            labels: {
                                app: req.name,
                                workspaceId: req.workspaceId,
                                env: req.environment,
                                creator: "atomist.k8-automation",
                            },
                            annotations: {
                                // tslint:disable-next-line:max-line-length
                                "atomist.com/k8vent": `{"environment":"${req.environment}","webhooks":["https://webhook.atomist.com/atomist/kube/teams/${req.workspaceId}"]}`,
                            },
                        },
                        spec: {
                            containers: [
                                {
                                    name: req.name,
                                    image: req.image,
                                    imagePullPolicy: "IfNotPresent",
                                    resources: {
                                        limits: {
                                            cpu: "1000m",
                                            memory: "384Mi",
                                        },
                                        requests: {
                                            cpu: "100m",
                                            memory: "320Mi",
                                        },
                                    },
                                },
                            ],
                            dnsPolicy: "ClusterFirst",
                            restartPolicy: "Always",
                        },
                    },
                    strategy: {
                        type: "RollingUpdate",
                        rollingUpdate: {
                            maxUnavailable: 0,
                            maxSurge: 1,
                        },
                    },
                },
            };
            assert.deepStrictEqual(d, e);
        });

    });

    describe("serviceTemplate", () => {

        it("should create a service spec", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
            };
            const s = serviceTemplate(req);
            const e = {
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: req.name,
                    labels: {
                        creator: "atomist.k8-automation",
                        app: req.name,
                        env: req.environment,
                        workspaceId: req.workspaceId,
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
                        app: req.name,
                        workspaceId: req.workspaceId,
                    },
                    sessionAffinity: "None",
                    type: "NodePort",
                },
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("endpointBaseUrl", () => {

        it("should return the default", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
            };
            const u = endpointBaseUrl(req);
            const e = "http://localhost/";
            assert(u === e);
        });

        it("should return the host and path", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
                protocol: "https",
            };
            const u = endpointBaseUrl(req);
            const e = `https://emi.com/bush/kate/hounds-of-love/cloudbusting/`;
            assert(u === e);
        });

        it("should return http protocol with no tlsSecret", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const u = endpointBaseUrl(req);
            const e = `http://emi.com/bush/kate/hounds-of-love/cloudbusting/`;
            assert(u === e);
        });

        it("should return https protocol with tslSecret", () => {
            const req: KubeApplication = {
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
            const u = endpointBaseUrl(req);
            const e = `https://emi.com/bush/kate/hounds-of-love/cloudbusting/`;
            assert(u === e);
        });

    });

    describe("ingressTemplate", () => {

        it("should create a wildcard ingress spec", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            const i = ingressTemplate(req);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    name: "atm-ingress",
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                },
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: req.name,
                                            servicePort: "http",
                                        },
                                        path: req.path,
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(i, e);
        });

        it("should create a host ingress spec", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
                protocol: "https",
                tlsSecret: "emi-com",
            };
            const i = ingressTemplate(req);
            const e = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            host: req.host,
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: req.name,
                                            servicePort: "http",
                                        },
                                        path: req.path,
                                    },
                                ],
                            },
                        },
                    ],
                    tls: [
                        {
                            hosts: [
                                "emi.com",
                            ],
                            secretName: "emi-com",
                        },
                    ],
                },
            };
            assert.deepStrictEqual(i, e);
        });

    });

    describe("ingressPatch", () => {

        it("should create an ingress patch", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            const i = ingressTemplate(req);
            const pReq: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "and-dream-of-sheep",
                image: "gcr.io/kate-bush/hounds-of-love/sheep:6.2.45",
                port: 6245,
                path: "/kate-bush/dream-of-sheep",
            };
            const ip = ingressPatch(i, pReq);
            const e = {
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: req.name,
                                            servicePort: "http",
                                        },
                                        path: req.path,
                                    },
                                    {
                                        backend: {
                                            serviceName: pReq.name,
                                            servicePort: "http",
                                        },
                                        path: pReq.path,
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should add a host rule", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            const i = ingressTemplate(req);
            const pReq: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "and-dream-of-sheep",
                image: "gcr.io/kate-bush/hounds-of-love/sheep:6.2.45",
                port: 6245,
                path: "/kate-bush/dream-of-sheep",
                host: "emi.com",
                protocol: "https",
                tlsSecret: "emi-com",
            };
            const ip = ingressPatch(i, pReq);
            const e = {
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: req.name,
                                            servicePort: "http",
                                        },
                                        path: req.path,
                                    },
                                ],
                            },
                        },
                        {
                            host: pReq.host,
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: pReq.name,
                                            servicePort: "http",
                                        },
                                        path: pReq.path,
                                    },
                                ],
                            },
                        },
                    ],
                    tls: [
                        {
                            hosts: [
                                "emi.com",
                            ],
                            secretName: "emi-com",
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should add to host rule", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const i = ingressTemplate(req);
            const pReq: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "and-dream-of-sheep",
                image: "gcr.io/kate-bush/hounds-of-love/sheep:6.2.45",
                port: 6245,
                path: "/kate-bush/dream-of-sheep",
                host: "emi.com",
            };
            const ip = ingressPatch(i, pReq);
            const e = {
                spec: {
                    rules: [
                        {
                            host: req.host,
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: req.name,
                                            servicePort: "http",
                                        },
                                        path: req.path,
                                    },
                                    {
                                        backend: {
                                            serviceName: pReq.name,
                                            servicePort: "http",
                                        },
                                        path: pReq.path,
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should throw an error if two services try to use same path", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            const i = ingressTemplate(req);
            const pReq: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "and-dream-of-sheep",
                image: "gcr.io/kate-bush/hounds-of-love/sheep:6.2.45",
                port: 6245,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            assert.throws(() => ingressPatch(i, pReq), /Cannot use path/);
        });

        it("should add to tls", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "kate.emi.com",
                protocol: "https",
                tlsSecret: "star-emi-com",
            };
            const i = ingressTemplate(req);
            const pReq: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "and-dream-of-sheep",
                image: "gcr.io/kate-bush/hounds-of-love/sheep:6.2.45",
                port: 6245,
                path: "/kate-bush/dream-of-sheep",
                host: "kate-bush.emi.com",
                protocol: "https",
                tlsSecret: "star-emi-com",
            };
            const ip = ingressPatch(i, pReq);
            const e = {
                spec: {
                    rules: [
                        {
                            host: req.host,
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: req.name,
                                            servicePort: "http",
                                        },
                                        path: req.path,
                                    },
                                ],
                            },
                        },
                        {
                            host: pReq.host,
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: pReq.name,
                                            servicePort: "http",
                                        },
                                        path: pReq.path,
                                    },
                                ],
                            },
                        },
                    ],
                    tls: [
                        {
                            hosts: [
                                "kate.emi.com",
                                "kate-bush.emi.com",
                            ],
                            secretName: "star-emi-com",
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

    });

    describe("ingressRemove", () => {

        it("should create an ingress patch", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const ip = ingressRemove(i, req);
            const e = {
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should create an ingress patch for a host", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const ip = ingressRemove(i, req);
            const e = {
                spec: {
                    rules: [
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should not do anything if there is no match", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                    {
                                        backend: {
                                            serviceName: "under-ice",
                                            servicePort: 7221,
                                        },
                                        path: "/kate_bush-hounds_of_love/underIce",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const ip = ingressRemove(i, req);
            assert(ip === undefined);
        });

        it("should remove the host-specific rule", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const ip = ingressRemove(i, req);
            const e = {
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should remove the host entry", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                ],
                            },
                        },
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const ip = ingressRemove(i, req);
            const e = {
                spec: {
                    rules: [
                        {
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/kate-bush/dream-of-sheep",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.deepStrictEqual(ip, e);
        });

        it("should remove the only path and return a spec with no rules", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "cloudbusting",
                                            servicePort: 5510,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            const ip = ingressRemove(i, req);
            const outback: Partial<Ingress> = { spec: { rules: [] } };
            assert.deepStrictEqual(ip, outback);
        });

        it("should refuse to remove the path of another service", () => {
            const req: KubeApplication = {
                workspaceId: "KAT3BU5H",
                environment: "new-wave",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
                path: "/bush/kate/hounds-of-love/cloudbusting",
                host: "emi.com",
            };
            const i: Ingress = {
                apiVersion: "extensions/v1beta1",
                kind: "Ingress",
                metadata: {
                    annotations: {
                        "kubernetes.io/ingress.class": "nginx",
                        "nginx.ingress.kubernetes.io/rewrite-target": "/",
                    },
                    labels: {
                        ingress: "nginx",
                        workspaceId: "KAT3BU5H",
                        env: "new-wave",
                        creator: "atomist.k8-automation",
                    },
                    name: "atm-ingress",
                },
                spec: {
                    rules: [
                        {
                            host: "emi.com",
                            http: {
                                paths: [
                                    {
                                        backend: {
                                            serviceName: "and-dream-of-sheep",
                                            servicePort: 6245,
                                        },
                                        path: "/bush/kate/hounds-of-love/cloudbusting",
                                    },
                                ],
                            },
                        },
                    ],
                },
            };
            assert.throws(() => ingressRemove(i, req), /Will not remove path/);
        });

    });

});
