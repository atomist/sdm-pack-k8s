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

/* tslint:disable:max-file-line-count */

import {
    GitProject,
    InMemoryProject,
    InMemoryProjectFile,
    projectUtils,
} from "@atomist/automation-client";
import * as yaml from "js-yaml";
import * as assert from "power-assert";
import { KubernetesApplication } from "../../lib/kubernetes/request";
import {
    matchSpec,
    ProjectFileSpec,
    specFileBasename,
    syncResources,
} from "../../lib/sync/application";
import { k8sSpecGlob } from "../../lib/sync/diff";

describe("sync/application", () => {

    describe("matchSpec", () => {

        it("should find nothing", () => {
            const sss = [
                [],
                [
                    {
                        file: new InMemoryProjectFile("svc.json", "{}"),
                        spec: {
                            apiVersion: "v1",
                            kind: "Service",
                            metadata: {
                                name: "lyle",
                                namespace: "lovett",
                            },
                        },
                    },
                    {
                        file: new InMemoryProjectFile("jondep.json", "{}"),
                        spec: {
                            apiVersion: "apps/v1",
                            kind: "Deployment",
                            metadata: {
                                name: "jon",
                                namespace: "lovett",
                            },
                        },
                    },
                    {
                        file: new InMemoryProjectFile("dep.json", "{}"),
                        spec: {
                            apiVersion: "apps/v1",
                            kind: "Deployment",
                            metadata: {
                                name: "lyle",
                                namespace: "alzado",
                            },
                        },
                    },
                    {
                        file: new InMemoryProjectFile("beta-dep.json", "{}"),
                        spec: {
                            apiVersion: "extensions/v1beta1",
                            kind: "Deployment",
                            metadata: {
                                name: "lyle",
                                namespace: "lovett",
                            },
                        },
                    },
                ],
            ];
            sss.forEach(ss => {
                const s = {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "lyle",
                        namespace: "lovett",
                    },
                };
                const m = matchSpec(s, ss);
                assert(m === undefined);
            });
        });

        it("should find the file spec", () => {
            const s = {
                apiVersion: "v1",
                kind: "Deployment",
                metadata: {
                    name: "lyle",
                    namespace: "lovett",
                },
            };
            const ss: ProjectFileSpec[] = [
                {
                    file: new InMemoryProjectFile("dep.json", "{}"),
                    spec: {
                        apiVersion: "v1",
                        kind: "Deployment",
                        metadata: {
                            name: "lyle",
                            namespace: "lovett",
                        },
                    },
                },
            ];
            const m = matchSpec(s, ss);
            assert.deepStrictEqual(m, ss[0]);
        });

        it("should find the right file spec among several", () => {
            const s = {
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    name: "lyle",
                    namespace: "lovett",
                },
            };
            const ss: ProjectFileSpec[] = [
                {
                    file: new InMemoryProjectFile("svc.json", "{}"),
                    spec: {
                        apiVersion: "v1",
                        kind: "Service",
                        metadata: {
                            name: "lyle",
                            namespace: "lovett",
                        },
                    },
                },
                {
                    file: new InMemoryProjectFile("jondep.json", "{}"),
                    spec: {
                        apiVersion: "apps/v1",
                        kind: "Deployment",
                        metadata: {
                            name: "jon",
                            namespace: "lovett",
                        },
                    },
                },
                {
                    file: new InMemoryProjectFile("dep.json", "{}"),
                    spec: {
                        apiVersion: "apps/v1",
                        kind: "Deployment",
                        metadata: {
                            name: "lyle",
                            namespace: "lovett",
                        },
                    },
                },
                {
                    file: new InMemoryProjectFile("beta-dep.json", "{}"),
                    spec: {
                        apiVersion: "extensions/v1beta1",
                        kind: "Deployment",
                        metadata: {
                            name: "lyle",
                            namespace: "lovett",
                        },
                    },
                },
            ];
            const m = matchSpec(s, ss);
            assert.deepStrictEqual(m, ss[2]);
        });

    });

    describe("specFileBasename", () => {

        it("should create a namespace file name", () => {
            const o = {
                apiVersion: "v1",
                kind: "Namespace",
                metadata: {
                    name: "lyle",
                },
            };
            const s = specFileBasename(o);
            assert(s === "lyle-namespace");
        });

        it("should create a simple namespaced file name", () => {
            ["Deployment", "Ingress", "Role", "Secret", "Service"].forEach(k => {
                const o = {
                    apiVersion: "v1",
                    kind: k,
                    metadata: {
                        name: "lyle",
                        namespace: "lovett",
                    },
                };
                const s = specFileBasename(o);
                const e = "lovett-lyle-" + k.toLowerCase();
                assert(s === e);
            });
        });

        it("should create a kebab-case namespaced file name", () => {
            [
                { k: "RoleBinding", l: "role-binding" },
                { k: "ServiceAccount", l: "service-account" },
            ].forEach(kl => {
                const o = {
                    apiVersion: "v1",
                    kind: kl.k,
                    metadata: {
                        name: "lyle",
                        namespace: "lovett",
                    },
                };
                const s = specFileBasename(o);
                const e = "lovett-lyle-" + kl.l;
                assert(s === e);
            });
        });

        it("should create a kebab-case cluster file name", () => {
            [
                { k: "ClusterRole", l: "cluster-role" },
                { k: "ClusterRoleBinding", l: "cluster-role-binding" },
            ].forEach(kl => {
                const o = {
                    apiVersion: "rbac.authorization.k8s.io/v1",
                    kind: kl.k,
                    metadata: {
                        name: "lyle",
                    },
                };
                const s = specFileBasename(o);
                const e = "lyle-" + kl.l;
                assert(s === e);
            });
        });

    });

    describe("syncResources", () => {

        it("should create spec files", async () => {
            const p: GitProject = InMemoryProject.of() as any;
            p.isClean = async () => false;
            let commitMessage: string;
            p.commit = async msg => { commitMessage = msg; return p; };
            let pushed = false;
            p.push = async msg => { pushed = true; return p; };
            const a: KubernetesApplication = {
                name: "tonina",
                ns: "black-angel",
            } as any;
            const rs = [
                {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "extensions/v1beta1",
                    kind: "Ingress",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "ServiceAccount",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
            ];
            await syncResources(a, rs, "upsert")(p);
            const eCommitMessage = `Update specs for black-angel/tonina

[atomist:generated] [atomist:sync-commit=@atomist/sdm-pack-k8s]
`;
            assert(commitMessage === eCommitMessage);
            assert(pushed, "commit was not pushed");
            assert(await p.totalFileCount() === 4);
            assert(p.fileExistsSync("black-angel-tonina-deployment.json"));
            assert(p.fileExistsSync("black-angel-tonina-service.json"));
            assert(p.fileExistsSync("black-angel-tonina-ingress.json"));
            assert(p.fileExistsSync("black-angel-tonina-service-account.json"));
        });

        it("should update spec files and avoid conflicts", async () => {
            const depJson = JSON.stringify({
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    name: "tonina",
                    namespace: "black-angel",
                },
            });
            const saYaml = `apiVersion: v1
kind: ServiceAccount
metadata:
  name: tonina
  namespace: black-angel
`;
            const p: GitProject = InMemoryProject.of(
                { path: "black-angel-tonina-deployment.json", content: depJson },
                { path: "black-angel-tonina-service.json", content: "{}\n" },
                { path: "black-angel-tonina-service-acct.yaml", content: saYaml },
            ) as any;
            p.isClean = async () => false;
            let commitMessage: string;
            p.commit = async msg => { commitMessage = msg; return p; };
            let pushed = false;
            p.push = async msg => { pushed = true; return p; };
            const a: KubernetesApplication = {
                name: "tonina",
                ns: "black-angel",
            } as any;
            const rs = [
                {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                        labels: {
                            "atomist.com/workspaceId": "T0N1N4",
                        },
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "extensions/v1beta1",
                    kind: "Ingress",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "ServiceAccount",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                        labels: {
                            "atomist.com/workspaceId": "T0N1N4",
                        },
                    },
                },
            ];
            await syncResources(a, rs, "upsert")(p);
            const eCommitMessage = `Update specs for black-angel/tonina

[atomist:generated] [atomist:sync-commit=@atomist/sdm-pack-k8s]
`;
            assert(commitMessage === eCommitMessage);
            assert(pushed, "commit was not pushed");
            assert(await p.totalFileCount() === 5);
            assert(p.fileExistsSync("black-angel-tonina-deployment.json"));
            assert(p.fileExistsSync("black-angel-tonina-service.json"));
            assert(p.fileExistsSync("black-angel-tonina-ingress.json"));
            assert(p.fileExistsSync("black-angel-tonina-service-acct.yaml"));
            const dep = JSON.parse(await p.getFile("black-angel-tonina-deployment.json").then(f => f.getContent()));
            assert.deepStrictEqual(dep, rs[0]);
            const sa = await p.getFile("black-angel-tonina-service-acct.yaml").then(f => f.getContent());
            assert(sa === yaml.safeDump(rs[3]));
            let foundServiceSpec = false;
            await projectUtils.doWithFiles(p, k8sSpecGlob, async f => {
                if (/^black-angel-tonina-service-[a-f0-9]+\.json$/.test(f.path)) {
                    const c = await f.getContent();
                    const s = JSON.parse(c);
                    assert.deepStrictEqual(s, rs[1]);
                    foundServiceSpec = true;
                }
            });
            assert(foundServiceSpec, "failed to find new service spec");
        });

        it("should delete spec files", async () => {
            const depJson = JSON.stringify({
                apiVersion: "apps/v1",
                kind: "Deployment",
                metadata: {
                    name: "tonina",
                    namespace: "black-angel",
                },
            });
            const saYaml = `apiVersion: v1
kind: ServiceAccount
metadata:
  name: tonina
  namespace: black-angel
`;
            const svcJson = JSON.stringify({
                apiVersion: "v1",
                kind: "Service",
                metadata: {
                    name: "tonina",
                    namespace: "black-angel",
                },
            });
            const p: GitProject = InMemoryProject.of(
                { path: "black-angel-tonina-deployment.json", content: depJson },
                { path: "black-angel-tonina-service.json", content: "{}\n" },
                { path: "black-angel-tonina-service-acct.yaml", content: saYaml },
                { path: "black-angel-tonina-svc.json", content: svcJson },
            ) as any;
            p.isClean = async () => false;
            let commitMessage: string;
            p.commit = async msg => { commitMessage = msg; return p; };
            let pushed = false;
            p.push = async msg => { pushed = true; return p; };
            const a: KubernetesApplication = {
                name: "tonina",
                ns: "black-angel",
            } as any;
            const rs = [
                {
                    apiVersion: "apps/v1",
                    kind: "Deployment",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                        labels: {
                            "atomist.com/workspaceId": "T0N1N4",
                        },
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "extensions/v1beta1",
                    kind: "Ingress",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "ServiceAccount",
                    metadata: {
                        name: "tonina",
                        namespace: "black-angel",
                        labels: {
                            "atomist.com/workspaceId": "T0N1N4",
                        },
                    },
                },
            ];
            await syncResources(a, rs, "delete")(p);
            const eCommitMessage = `Delete specs for black-angel/tonina

[atomist:generated] [atomist:sync-commit=@atomist/sdm-pack-k8s]
`;
            assert(commitMessage === eCommitMessage);
            assert(pushed, "commit was not pushed");
            assert(await p.totalFileCount() === 1);
            assert(!p.fileExistsSync("black-angel-tonina-deployment.json"));
            assert(p.fileExistsSync("black-angel-tonina-service.json"));
            assert(!p.fileExistsSync("black-angel-tonina-ingress.json"));
            assert(!p.fileExistsSync("black-angel-tonina-service-acct.yaml"));
            assert(!p.fileExistsSync("black-angel-tonina-svc.yaml"));
            const svc = await p.getFile("black-angel-tonina-service.json").then(f => f.getContent());
            assert(svc === "{}\n");
        });

    });

});
