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
    BitBucketServerRepoRef,
    GitCommandGitProject,
    GitHubRepoRef,
    GitlabRepoRef,
    GitProject,
    InMemoryProject,
    RepoRef,
    ScmProviderType,
    TokenCredentials,
} from "@atomist/automation-client";
import { SoftwareDeliveryMachine } from "@atomist/sdm";
import * as assert from "power-assert";
import {
    queryForScmProvider,
    repoCredentials,
    scmCredentials,
    sortSpecs,
} from "../../lib/sync/startup";
import {
    RepoScmProvider,
    ScmProviders,
} from "../../lib/typings/types";

describe("sync/syncRepoStartup", () => {

    describe("scmCredentials", () => {

        it("should return undefined if not provided enough information", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {};
            const rc = scmCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return undefined if no apiUrl", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                credential: {
                    secret: "m@n-0n-th3-m00n",
                },
            };
            const rc = scmCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return undefined if no credential", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://api.github.com",
            };
            const rc = scmCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return undefined if no secret", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://api.github.com",
                credential: {},
            };
            const rc = scmCredentials(r, s);
            assert.deepStrictEqual(rc, undefined);
        });

        it("should return undefined if no repo ref", () => {
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://api.github.com",
                credential: {},
            };
            const rc = scmCredentials(undefined, s);
            assert(rc === undefined);
        });

        it("should return undefined if no owner", () => {
            const r: RepoRef = {
                owner: "",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://api.github.com",
                credential: {
                    secret: "m@n-0n-th3-m00n",
                },
            };
            const rc = scmCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return undefined if no repo", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://api.github.com",
                credential: {
                    secret: "m@n-0n-th3-m00n",
                },
            };
            const rc = scmCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return ghe repo ref", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://ghe.sugar.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://ghe.sugar.com/api/v3",
                credential: {
                    secret: "m@n-0n-th3-m00n",
                },
                providerType: "ghe" as any,
                url: "https://ghe.sugar.com/",
            };
            const rc = scmCredentials(r, s);
            assert(rc, "no RepoCredentials returned");
            assert((rc.credentials as TokenCredentials).token === "m@n-0n-th3-m00n");
            assert((rc.id as GitHubRepoRef).apiBase === "ghe.sugar.com/api/v3");
            assert(rc.id.branch === undefined);
            assert(rc.id.owner === "bob-mould");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.ghe);
            assert(rc.id.remoteBase === "ghe.sugar.com");
            assert(rc.id.repo === "sugar");
            assert((rc.id as GitHubRepoRef).scheme === "https://");
            assert(rc.id.sha === undefined);
        });

        it("should use sha and branch", () => {
            const r: RepoRef = {
                branch: "beaster",
                owner: "bob-mould",
                repo: "sugar",
                sha: "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://api.github.com",
                credential: {
                    secret: "m@n-0n-th3-m00n",
                },
            };
            const rc = scmCredentials(r, s);
            assert(rc, "no RepoCredentials returned");
            assert((rc.credentials as TokenCredentials).token === "m@n-0n-th3-m00n");
            assert((rc.id as GitHubRepoRef).apiBase === "api.github.com");
            assert(rc.id.branch === "beaster");
            assert(rc.id.owner === "bob-mould");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.github_com);
            assert(rc.id.remoteBase === "github.com");
            assert(rc.id.repo === "sugar");
            assert((rc.id as GitHubRepoRef).scheme === "https://");
            assert(rc.id.sha === "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a");
        });

        it("should create a bitbucket ref", () => {
            const r: RepoRef = {
                branch: "FunHouse",
                owner: "TheStooges",
                repo: "iggy",
                sha: "bb94dbf2a40b3754f2e62797c80923b938f60fb3",
                url: "https://bitbucket.iggyandthestooges.com/TheStooges/iggy",
            };
            const s: ScmProviders.ScmProvider = {
                apiUrl: "https://bitbucket.iggyandthestooges.com/",
                credential: {
                    secret: "1w@nn@b3y0u4d0g",
                },
                providerType: "bitbucket" as any,
            };
            const rc = scmCredentials(r, s);
            assert(rc, "no RepoCredentials returned");
            assert((rc.credentials as TokenCredentials).token === "1w@nn@b3y0u4d0g");
            assert((rc.id as BitBucketServerRepoRef).apiBase === "bitbucket.iggyandthestooges.com/rest/api/1.0");
            assert(rc.id.branch === "FunHouse");
            assert(rc.id.owner === "TheStooges");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.bitbucket);
            assert(rc.id.remoteBase === "bitbucket.iggyandthestooges.com");
            assert(rc.id.repo === "iggy");
            assert((rc.id as BitBucketServerRepoRef).scheme === "https://");
            assert(rc.id.sha === "bb94dbf2a40b3754f2e62797c80923b938f60fb3");
        });

    });

    describe("repoCredentials", () => {

        it("should return undefined if not provided enough information", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: RepoScmProvider.Repo = {};
            const rc = repoCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return undefined if no scmProvider", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: RepoScmProvider.Repo = {
                org: {},
            };
            const rc = repoCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return undefined if no scmProvider properties", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: RepoScmProvider.Repo = {
                org: {
                    scmProvider: {},
                },
            };
            const rc = repoCredentials(r, s);
            assert(rc === undefined);
        });

        it("should return remote repo ref", () => {
            const r: RepoRef = {
                owner: "bob-mould",
                repo: "sugar",
                url: "https://github.com/bob-mould/sugar",
            };
            const s: RepoScmProvider.Repo = {
                org: {
                    scmProvider: {
                        apiUrl: "https://api.github.com",
                        credential: {
                            secret: "m@n-0n-th3-m00n",
                        },
                    },
                },
            };
            const rc = repoCredentials(r, s);
            assert(rc, "no RepoCredentials returned");
            assert((rc.credentials as TokenCredentials).token === "m@n-0n-th3-m00n");
            assert((rc.id as GitHubRepoRef).apiBase === "api.github.com");
            assert(rc.id.branch === undefined);
            assert(rc.id.owner === "bob-mould");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.github_com);
            assert(rc.id.remoteBase === "github.com");
            assert(rc.id.repo === "sugar");
            assert((rc.id as GitHubRepoRef).scheme === "https://");
            assert(rc.id.sha === undefined);
        });

        it("should create a gitlab ref", () => {
            const r: RepoRef = {
                branch: "too-much-too-soon",
                owner: "NewYorkDolls",
                repo: "trash",
                sha: "bb94dbf2a40b3754f2e62797c80923b938f60fb3",
                url: "http://gitlab.nydolls.com/NewYorkDolls/trash",
            };
            const s: RepoScmProvider.Repo = {
                org: {
                    scmProvider: {
                        apiUrl: "http://gitlab.nydolls.com/api/v4/",
                        credential: {
                            secret: "P34$0n@l1tyC41$1$",
                        },
                        providerType: "gitlab" as any,
                        url: "http://gitlab.nydolls.com/",
                    },
                },
            };
            const rc = repoCredentials(r, s);
            assert(rc, "no RepoCredentials returned");
            assert((rc.credentials as TokenCredentials).token === "P34$0n@l1tyC41$1$");
            // GitlabReporef overrides apiBase to include the scheme and not strip any trailing slash
            assert((rc.id as GitlabRepoRef).apiBase === "http://gitlab.nydolls.com/api/v4/");
            assert(rc.id.branch === "too-much-too-soon");
            assert(rc.id.owner === "NewYorkDolls");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.gitlab_enterprise);
            assert(rc.id.remoteBase === "gitlab.nydolls.com");
            assert(rc.id.repo === "trash");
            assert((rc.id as GitlabRepoRef).scheme === "http://");
            assert(rc.id.sha === "bb94dbf2a40b3754f2e62797c80923b938f60fb3");
        });

    });

    describe("sortSpecs", () => {

        it("should sort nothing successfully", async () => {
            const r: GitProject = InMemoryProject.of() as any;
            const s = await sortSpecs(r);
            assert.deepStrictEqual(s, []);
        });

        it("should sort specs successfully", async () => {
            const r: GitProject = InMemoryProject.of(
                { path: "80-b-deployment.json", content: "{}" },
                { path: "60-c-service.json", content: "{}" },
                { path: "60-d-service.json", content: "{}" },
                { path: "80-a-deployment.yaml", content: "kind: Deployment\n" },
                { path: "00-x-daemonset.json", content: "{}" },
                { path: "50-z-ingress.yml", content: "" },
            ) as any;
            const s = await sortSpecs(r);
            assert(s.length === 6);
            assert(s[0].name === "00-x-daemonset.json");
            assert(s[1].name === "50-z-ingress.yml");
            assert(s[2].name === "60-c-service.json");
            assert(s[3].name === "60-d-service.json");
            assert(s[4].name === "80-a-deployment.yaml");
            assert(s[5].name === "80-b-deployment.json");
        });

        it("should exclude non-spec files", async () => {
            const r: GitProject = InMemoryProject.of(
                { path: "README.md", content: "# Project\n" },
                { path: "80-b-deployment.json", content: "{}" },
                { path: "60-c-service.json", content: "{}" },
                { path: "index.ts", content: "" },
                { path: "60-d-service.json", content: "{}" },
                { path: "80-a-deployment.yaml", content: "kind: Deployment\n" },
                { path: "lib/stuff.ts", content: "" },
                { path: "00-x-daemonset.json", content: "{}" },
                { path: "50-z-ingress.yml", content: "" },
                { path: "test/stuff.test.ts", content: "" },
            ) as any;
            const s = await sortSpecs(r);
            assert(s.length === 6);
            assert(s[0].name === "00-x-daemonset.json");
            assert(s[1].name === "50-z-ingress.yml");
            assert(s[2].name === "60-c-service.json");
            assert(s[3].name === "60-d-service.json");
            assert(s[4].name === "80-a-deployment.yaml");
            assert(s[5].name === "80-b-deployment.json");
        });

    });

    describe("queryForScmProvider", () => {

        it("should find the repo", async () => {
            let queried = false;
            const s: SoftwareDeliveryMachine = {
                configuration: {
                    graphql: {
                        client: {
                            factory: {
                                create: () => ({
                                    query: async (o: any) => {
                                        queried = true;
                                        assert(o.variables.owner === "bob-mould");
                                        assert(o.variables.repo === "sugar");
                                        if (o.name === "RepoScmProvider") {
                                            return {
                                                Repo: [
                                                    {
                                                        org: {
                                                            scmProvider: {
                                                                apiUrl: "https://api.github.com",
                                                                credential: {
                                                                    secret: "m@n-0n-th3-m00n",
                                                                },
                                                            },
                                                        },
                                                    },
                                                ],
                                            };
                                        }
                                        return { SCMProvider: [] as any[] };
                                    },
                                }),
                            },
                        },
                    },
                    workspaceIds: ["A4USK34DU"],
                },
            } as any;
            const r: RepoRef = {
                branch: "beaster",
                owner: "bob-mould",
                repo: "sugar",
                sha: "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a",
                url: "https://github.com/bob-mould/sugar",
            };
            const rc = await queryForScmProvider(s, r);
            assert(rc, "no RepoCredentials returned");
            assert(queried, "query method never called");
            assert((rc.credentials as TokenCredentials).token === "m@n-0n-th3-m00n");
            assert((rc.id as GitHubRepoRef).apiBase === "api.github.com");
            assert(rc.id.branch === "beaster");
            assert(rc.id.owner === "bob-mould");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.github_com);
            assert(rc.id.remoteBase === "github.com");
            assert(rc.id.repo === "sugar");
            assert((rc.id as GitHubRepoRef).scheme === "https://");
            assert(rc.id.sha === "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a");
        });

        it("should find nothing", async () => {
            let queried = false;
            const s: SoftwareDeliveryMachine = {
                configuration: {
                    graphql: {
                        client: {
                            factory: {
                                create: () => ({
                                    query: async (o: any) => {
                                        queried = true;
                                        return (o.name === "RepoScmProvider") ? { Repo: [] as any[] } : { SCMProvider: [] as any[] };
                                    },
                                }),
                            },
                        },
                    },
                    workspaceIds: ["A4USK34DU"],
                },
            } as any;
            const r: RepoRef = {
                branch: "beaster",
                owner: "bob-mould",
                repo: "sugar",
                sha: "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a",
                url: "https://github.com/bob-mould/sugar",
            };
            const rc = await queryForScmProvider(s, r);
            assert(queried, "query method never called");
            assert(rc === undefined);
        });

        it("should find the repo via the provider", async () => {
            const clonedOrig = GitCommandGitProject.cloned;
            GitCommandGitProject.cloned = async (creds, id, opts) => ({} as any);
            let queried = false;
            const s: SoftwareDeliveryMachine = {
                configuration: {
                    graphql: {
                        client: {
                            factory: {
                                create: () => ({
                                    query: async (o: any) => {
                                        queried = true;
                                        if (o.name === "ScmProviders") {
                                            return {
                                                SCMProvider: [
                                                    {
                                                        apiUrl: "https://bitbucket.iggyandthestooges.com/",
                                                        credential: {
                                                            secret: "1w@nn@b3y0u4d0g",
                                                        },
                                                        providerType: "bitbucket" as any,
                                                    },
                                                ],
                                            };
                                        }
                                        return { Repo: [] as any[] };
                                    },
                                }),
                            },
                        },
                    },
                    workspaceIds: ["A4USK34DU"],
                },
            } as any;
            const r: RepoRef = {
                branch: "FunHouse",
                owner: "TheStooges",
                repo: "iggy",
                sha: "bb94dbf2a40b3754f2e62797c80923b938f60fb3",
                url: "https://bitbucket.iggyandthestooges.com/TheStooges/iggy",
            };
            const rc = await queryForScmProvider(s, r);
            GitCommandGitProject.cloned = clonedOrig;
            assert(rc, "no RepoCredentials returned");
            assert(queried, "query method never called");
            assert((rc.credentials as TokenCredentials).token === "1w@nn@b3y0u4d0g");
            assert((rc.id as BitBucketServerRepoRef).apiBase === "bitbucket.iggyandthestooges.com/rest/api/1.0");
            assert(rc.id.branch === "FunHouse");
            assert(rc.id.owner === "TheStooges");
            assert(rc.id.path === undefined);
            assert(rc.id.providerType === ScmProviderType.bitbucket);
            assert(rc.id.remoteBase === "bitbucket.iggyandthestooges.com");
            assert(rc.id.repo === "iggy");
            assert((rc.id as BitBucketServerRepoRef).scheme === "https://");
            assert(rc.id.sha === "bb94dbf2a40b3754f2e62797c80923b938f60fb3");
        });

    });

});
