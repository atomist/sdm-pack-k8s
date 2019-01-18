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

import {
    GitProject,
    HandlerContext,
    InMemoryProject,
} from "@atomist/automation-client";
import {
    RepoContext,
    SdmGoalEvent,
} from "@atomist/sdm";
import * as assert from "power-assert";
import {
    defaultDeploymentData,
    defaultImage,
    defaultIngress,
    dockerPort,
    getKubernetesGoalEventData,
    kubernetesApplicationCallback,
} from "../../lib/deploy/callback";
import {
    KubernetesDeploy,
    KubernetesDeployRegistration,
} from "../../lib/deploy/goal";
import { KubernetesApplication } from "../../lib/kubernetes/request";

/* tslint:disable:max-file-line-count */

describe("deploy/application", () => {

    describe("dockerPort", () => {

        it("should not find a port successfully", async () => {
            const p = InMemoryProject.of();
            const d = await dockerPort(p);
            assert(d === undefined);
        });

        it("should find a port successfully", async () => {
            const p = InMemoryProject.of({ path: "Dockerfile", content: "EXPOSE 80\n" });
            const d = await dockerPort(p);
            assert(d === 80);
        });

        it("should find a UDP port successfully", async () => {
            const p = InMemoryProject.of({ path: "Dockerfile", content: "EXPOSE 8080/udp\n" });
            const d = await dockerPort(p);
            assert(d === 8080);
        });

        it("should find first port successfully", async () => {
            const p = InMemoryProject.of({ path: "Dockerfile", content: "FROM ubuntu\nEXPOSE 8888/tcp 80/tcp\nENV BELIEVER=rhett\n" });
            const d = await dockerPort(p);
            assert(d === 8888);
        });

        it("should find first export port successfully", async () => {
            const p = InMemoryProject.of({ path: "Dockerfile", content: "FROM ubuntu\nEXPOSE 8888/tcp\nEXPOSE 80/tcp\nENV BELIEVER=rhett\n" });
            const d = await dockerPort(p);
            assert(d === 8888);
        });

    });

    describe("defaultImage", () => {

        it("should find after push image", async () => {
            const e: SdmGoalEvent = {
                push: {
                    after: {
                        images: [{ imageName: "miller/rhett:instigator" }],
                    },
                },
            } as any;
            const k: KubernetesDeploy = {} as any;
            const c: HandlerContext = {} as any;
            const i = await defaultImage(e, k, c);
            assert(i === "miller/rhett:instigator");
        });

        it("should use the registry", async () => {
            const e: SdmGoalEvent = {
                branch: "dreamer",
                push: {
                    after: {},
                },
                repo: {
                    name: "believer",
                    owner: "rhettmiller",
                    providerId: "verve-forecast",
                },
                sha: "abcdef0123456789",
            } as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {
                        sdm: {
                            docker: {
                                registry: "rhett.miller.com",
                            },
                        },
                    },
                },
            } as any;
            const c: HandlerContext = {} as any;
            const i = await defaultImage(e, k, c);
            assert(i === "rhett.miller.com/believer:latest");
        });

        it("should use the registry and clean repo name", async () => {
            const e: SdmGoalEvent = {
                push: {
                    after: {},
                },
                repo: {
                    name: "-believer.",
                    owner: "rhettmiller",
                },
            } as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {
                        sdm: {
                            docker: {
                                registry: "rhett.miller.com",
                            },
                        },
                    },
                },
            } as any;
            const c: HandlerContext = {} as any;
            const i = await defaultImage(e, k, c);
            assert(i === "rhett.miller.com/believer:latest");
        });

        it("should use the repo information and latest tag", async () => {
            const e: SdmGoalEvent = {
                branch: "dreamer",
                push: {
                    after: {},
                },
                repo: {
                    name: "dreamer",
                    owner: "rhettmiller",
                    providerId: "maximum-sunshine-records",
                },
                sha: "abcdef0123456789",
            } as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {},
                },
            } as any;
            const c: HandlerContext = {} as any;
            const i = await defaultImage(e, k, c);
            assert(i === "rhettmiller/dreamer:latest");
        });

        it("should clean up the repo information", async () => {
            const e: SdmGoalEvent = {
                push: {
                    after: {},
                },
                repo: {
                    name: "dreamer",
                    owner: "rhett-miller",
                },
            } as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {},
                },
            } as any;
            const c: HandlerContext = {} as any;
            const i = await defaultImage(e, k, c);
            assert(i === "rhettmiller/dreamer:latest");
        });

    });

    describe("defaultIngress", () => {

        it("should not return anything if not in local mode", async () => {
            const e: SdmGoalEvent = {} as any;
            const k: KubernetesDeploy = {} as any;
            const i = await defaultIngress(e, k);
            assert(i === undefined);
        });

    });

    describe("defaultDeploymentData", () => {

        it("should return something reasonable with minimal information", async () => {
            const p: GitProject = InMemoryProject.of() as any;
            const e: SdmGoalEvent = {
                push: {
                    after: {},
                },
                repo: {
                    name: "new-york",
                    owner: "loureed",
                },
            } as any;
            const k: KubernetesDeploy = {
                details: {
                    environment: "NewYork",
                },
                sdm: {
                    configuration: {
                        sdm: {},
                    },
                },
            } as any;
            const c: HandlerContext = { workspaceId: "L0UR33D" } as any;
            const d = await defaultDeploymentData(p, e, k, c);
            const r = {
                workspaceId: "L0UR33D",
                environment: "NewYork",
                name: "new-york",
                ns: "NewYork",
                image: "loureed/new-york:latest",
                port: undefined,
                deploymentSpec: undefined,
                serviceSpec: undefined,
                ingressSpec: undefined,
                roleSpec: undefined,
                serviceAccountSpec: undefined,
                roleBindingSpec: undefined,
            } as any;
            assert.deepStrictEqual(d, r);
        });

        it("should return all the modifications", async () => {
            const p: GitProject = InMemoryProject.of(
                { path: ".atomist/kubernetes/deployment.json", content: `{"spec":{"template":{"spec":{"terminationGracePeriodSeconds":7}}}}` },
                { path: ".atomist/kubernetes/service.yml", content: `spec:\n  metadata:\n    annotation:\n      halloween: parade\n` },
                { path: "Dockerfile", content: "EXPOSE 8080/udp\n" },
            ) as any;
            const e: SdmGoalEvent = {
                branch: "rock",
                push: {
                    after: {
                        images: [{ imageName: "docker.lou-reed.com/newyork:1989" }],
                    },
                },
                repo: {
                    name: "new-york",
                    owner: "loureed",
                    providerId: "sire",
                },
                sha: "ca19881989",
            } as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {
                        environment: "NewYork",
                        sdm: {
                            docker: {
                                registry: "lou.reed.com",
                            },
                            k8s: {
                                app: {
                                    ns: "romeo-juliet",
                                    host: "dirty.blvd.org",
                                    tlsSecret: "star-blvd-org",
                                },
                            },
                        },
                    },
                },
            } as any;
            const c: HandlerContext = { workspaceId: "L0UR33D" } as any;
            const d = await defaultDeploymentData(p, e, k, c);
            const r = {
                workspaceId: "L0UR33D",
                environment: "NewYork",
                name: "new-york",
                ns: "romeo-juliet",
                image: "docker.lou-reed.com/newyork:1989",
                port: 8080,
                host: "dirty.blvd.org",
                tlsSecret: "star-blvd-org",
                deploymentSpec: {
                    spec: {
                        template: {
                            spec: {
                                terminationGracePeriodSeconds: 7,
                            },
                        },
                    },
                },
                serviceSpec: {
                    spec: {
                        metadata: {
                            annotation: {
                                halloween: "parade",
                            },
                        },
                    },
                },
                ingressSpec: undefined,
                roleSpec: undefined,
                serviceAccountSpec: undefined,
                roleBindingSpec: undefined,
            } as any;
            assert.deepStrictEqual(d, r);
        });

    });

    describe("kubernetesApplicationCallback", () => {

        it("should return goal with data", async () => {
            const p: GitProject = InMemoryProject.of() as any;
            const e: SdmGoalEvent = {
                push: {
                    after: {},
                },
                repo: {
                    name: "new-york",
                    owner: "loureed",
                },
            } as any;
            const k: KubernetesDeploy = {
                details: {
                    environment: "NewYork",
                },
                sdm: {
                    configuration: {
                        sdm: {
                            projectLoader: {
                                doWithProject: (x: any, a: (gp: GitProject) => Promise<SdmGoalEvent>) => a(p),
                            },
                        },
                    },
                },
            } as any;
            const r: KubernetesDeployRegistration = {} as any;
            const rc: RepoContext = {
                context: {
                    workspaceId: "L0UR33D",
                },
            } as any;
            const sge = await kubernetesApplicationCallback(k, r)(e, rc);
            assert(Object.keys(sge).length === 3);
            assert.deepStrictEqual(sge.push, { after: {} });
            assert.deepStrictEqual(sge.repo, { name: "new-york", owner: "loureed" });
            assert(sge.data);
            const gd = JSON.parse(sge.data);
            const exp = {
                workspaceId: "L0UR33D",
                environment: "NewYork",
                name: "new-york",
                ns: "NewYork",
                image: "loureed/new-york:latest",
            };
            assert.deepStrictEqual(gd["sdm-pack-k8s"], exp);
        });

        it("should return goal when data is guff", async () => {
            const p: GitProject = InMemoryProject.of() as any;
            const e: SdmGoalEvent = {
                data: ["there", "is", "no", "time"],
                push: {
                    after: {},
                },
                repo: {
                    name: "new-york",
                    owner: "loureed",
                },
            } as any;
            const k: KubernetesDeploy = {
                details: {
                    environment: "NewYork",
                },
                sdm: {
                    configuration: {
                        sdm: {
                            projectLoader: {
                                doWithProject: (x: any, a: (gp: GitProject) => Promise<SdmGoalEvent>) => a(p),
                            },
                        },
                    },
                },
            } as any;
            const r: KubernetesDeployRegistration = {} as any;
            const rc: RepoContext = {
                context: {
                    workspaceId: "L0UR33D",
                },
            } as any;
            const sge = await kubernetesApplicationCallback(k, r)(e, rc);
            assert(Object.keys(sge).length === 3);
            assert.deepStrictEqual(sge.push, { after: {} });
            assert.deepStrictEqual(sge.repo, { name: "new-york", owner: "loureed" });
            assert(sge.data);
            const gd = JSON.parse(sge.data);
            const exp = {
                workspaceId: "L0UR33D",
                environment: "NewYork",
                name: "new-york",
                ns: "NewYork",
                image: "loureed/new-york:latest",
            };
            assert.deepStrictEqual(gd["sdm-pack-k8s"], exp);
        });

        it("should merge all provided data properly", async () => {
            const p: GitProject = InMemoryProject.of(
                {
                    path: ".atomist/kubernetes/deployment.json",
                    content: `{"spec":{"replicas":5,"template":{"spec":{"dnsPolicy":"None","terminationGracePeriodSeconds":7}}}}`,
                },
                { path: ".atomist/kubernetes/service.yml", content: `spec:\n  metadata:\n    annotation:\n      halloween: parade\n` },
                { path: "Dockerfile", content: "EXPOSE 8080/udp\n" },
            ) as any;
            const e: SdmGoalEvent = {
                branch: "rock",
                data: JSON.stringify({
                    "Xmas": "in February",
                    "sdm-pack-k8s": {
                        host: "sick.of.you",
                        path: "/hold/on",
                        replicas: 14,
                        deploymentSpec: {
                            spec: {
                                template: {
                                    spec: {
                                        dnsPolicy: "Default",
                                    },
                                },
                            },
                        },
                    },
                }),
                push: {
                    after: {
                        images: [{ imageName: "docker.lou-reed.com/newyork:1989" }],
                    },
                },
                repo: {
                    name: "new-york",
                    owner: "loureed",
                    providerId: "sire",
                },
                sha: "ca19881989",
            } as any;
            const k: KubernetesDeploy = {
                sdm: {
                    configuration: {
                        environment: "NewYork",
                        sdm: {
                            docker: {
                                registry: "lou.reed.com",
                            },
                            k8s: {
                                app: {
                                    ns: "romeo-juliet",
                                    host: "dirty.blvd.org",
                                    tlsSecret: "star-blvd-org",
                                },
                            },
                            projectLoader: {
                                doWithProject: (x: any, a: (gp: GitProject) => Promise<SdmGoalEvent>) => a(p),
                            },
                        },
                    },
                },
            } as any;
            const r: KubernetesDeployRegistration = {
                applicationData: (rp: GitProject, ra: KubernetesApplication) => Promise.resolve({
                    ...ra,
                    replicas: 5640,
                    tlsSecret: "sickofyou",
                    deploymentSpec: {
                        ...ra.deploymentSpec,
                        spec: {
                            ...ra.deploymentSpec.spec,
                            replicas: 11,
                        },
                    },
                    roleSpec: {
                        rules: [
                            {
                                apiGroups: [""],
                                resources: ["services"],
                                verbs: ["get", "watch", "list"],
                            },
                        ],
                    },
                }),
            } as any;
            const rc: RepoContext = {
                context: {
                    workspaceId: "L0UR33D",
                },
            } as any;
            const sge = await kubernetesApplicationCallback(k, r)(e, rc);
            assert(Object.keys(sge).length === 5);
            assert(sge.branch === "rock");
            assert(sge.sha === "ca19881989");
            assert.deepStrictEqual(sge.push, { after: { images: [{ imageName: "docker.lou-reed.com/newyork:1989" }] } });
            assert.deepStrictEqual(sge.repo, { name: "new-york", owner: "loureed", providerId: "sire" });
            assert(sge.data);
            const gd = JSON.parse(sge.data);
            assert(gd.Xmas === "in February");
            const exp = {
                workspaceId: "L0UR33D",
                environment: "NewYork",
                host: "sick.of.you",
                name: "new-york",
                ns: "romeo-juliet",
                image: "docker.lou-reed.com/newyork:1989",
                path: "/hold/on",
                port: 8080,
                replicas: 5640,
                tlsSecret: "sickofyou",
                deploymentSpec: {
                    spec: {
                        replicas: 11,
                        template: {
                            spec: {
                                dnsPolicy: "Default",
                                terminationGracePeriodSeconds: 7,
                            },
                        },
                    },
                },
                serviceSpec: {
                    spec: {
                        metadata: {
                            annotation: {
                                halloween: "parade",
                            },
                        },
                    },
                },
                roleSpec: {
                    rules: [
                        {
                            apiGroups: [""],
                            resources: ["services"],
                            verbs: ["get", "watch", "list"],
                        },
                    ],
                },
            };
            assert.deepStrictEqual(gd["sdm-pack-k8s"], exp);
        });

    });

    describe("getKubernetesGoalEventData", () => {

        it("should return undefined if no goal event", () => {
            const k = getKubernetesGoalEventData(undefined);
            assert(k === undefined);
        });

        it("should return undefined if no data", async () => {
            const g: SdmGoalEvent = {} as any;
            const k = getKubernetesGoalEventData(g);
            assert(k === undefined);
        });

        it("should return undefined if no kubernetes application", () => {
            const g: SdmGoalEvent = { data: "{}" } as any;
            const k = getKubernetesGoalEventData(g);
            assert(k === undefined);
        });

        it("should throw an exception if data cannot be parsed", () => {
            const g: SdmGoalEvent = { data: "}{" } as any;
            assert.throws(() => getKubernetesGoalEventData(g), /Failed to parse goal event data/);
        });

        it("should return application data", () => {
            const g: SdmGoalEvent = {
                data: `{"sdm-pack-k8s":{"name":"nowhere-man","ns":"rubber-soul","workspaceId":"EM15TUD105"}}`,
            } as any;
            const k = getKubernetesGoalEventData(g);
            const e = {
                name: "nowhere-man",
                ns: "rubber-soul",
                workspaceId: "EM15TUD105",
            };
            assert.deepStrictEqual(k, e);
        });

    });

});
