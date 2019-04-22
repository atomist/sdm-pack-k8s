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
    BitBucketServerRepoRef,
    GitCommandGitProject,
    GitHubRepoRef,
    GitlabRepoRef,
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
} from "../../lib/sync/repo";
import {
    RepoScmProvider,
    ScmProviders,
} from "../../lib/typings/types";

describe("sync/repo", () => {

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
            assert((rc.repo as GitHubRepoRef).apiBase === "ghe.sugar.com/api/v3");
            assert(rc.repo.branch === undefined);
            assert(rc.repo.owner === "bob-mould");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.ghe);
            assert(rc.repo.remoteBase === "ghe.sugar.com");
            assert(rc.repo.repo === "sugar");
            assert((rc.repo as GitHubRepoRef).scheme === "https://");
            assert(rc.repo.sha === undefined);
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
            assert((rc.repo as GitHubRepoRef).apiBase === "api.github.com");
            assert(rc.repo.branch === "beaster");
            assert(rc.repo.owner === "bob-mould");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.github_com);
            assert(rc.repo.remoteBase === "github.com");
            assert(rc.repo.repo === "sugar");
            assert((rc.repo as GitHubRepoRef).scheme === "https://");
            assert(rc.repo.sha === "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a");
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
            assert((rc.repo as BitBucketServerRepoRef).apiBase === "bitbucket.iggyandthestooges.com/rest/api/1.0");
            assert(rc.repo.branch === "FunHouse");
            assert(rc.repo.owner === "TheStooges");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.bitbucket);
            assert(rc.repo.remoteBase === "bitbucket.iggyandthestooges.com");
            assert(rc.repo.repo === "iggy");
            assert((rc.repo as BitBucketServerRepoRef).scheme === "https://");
            assert(rc.repo.sha === "bb94dbf2a40b3754f2e62797c80923b938f60fb3");
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
            assert((rc.repo as GitHubRepoRef).apiBase === "api.github.com");
            assert(rc.repo.branch === undefined);
            assert(rc.repo.owner === "bob-mould");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.github_com);
            assert(rc.repo.remoteBase === "github.com");
            assert(rc.repo.repo === "sugar");
            assert((rc.repo as GitHubRepoRef).scheme === "https://");
            assert(rc.repo.sha === undefined);
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
            assert((rc.repo as GitlabRepoRef).apiBase === "http://gitlab.nydolls.com/api/v4/");
            assert(rc.repo.branch === "too-much-too-soon");
            assert(rc.repo.owner === "NewYorkDolls");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.gitlab_enterprise);
            assert(rc.repo.remoteBase === "gitlab.nydolls.com");
            assert(rc.repo.repo === "trash");
            assert((rc.repo as GitlabRepoRef).scheme === "http://");
            assert(rc.repo.sha === "bb94dbf2a40b3754f2e62797c80923b938f60fb3");
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
            assert((rc.repo as GitHubRepoRef).apiBase === "api.github.com");
            assert(rc.repo.branch === "beaster");
            assert(rc.repo.owner === "bob-mould");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.github_com);
            assert(rc.repo.remoteBase === "github.com");
            assert(rc.repo.repo === "sugar");
            assert((rc.repo as GitHubRepoRef).scheme === "https://");
            assert(rc.repo.sha === "3ffe13c1f532a3d8e2d44b1b66e6f8235c35f94a");
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
            assert((rc.repo as BitBucketServerRepoRef).apiBase === "bitbucket.iggyandthestooges.com/rest/api/1.0");
            assert(rc.repo.branch === "FunHouse");
            assert(rc.repo.owner === "TheStooges");
            assert(rc.repo.path === undefined);
            assert(rc.repo.providerType === ScmProviderType.bitbucket);
            assert(rc.repo.remoteBase === "bitbucket.iggyandthestooges.com");
            assert(rc.repo.repo === "iggy");
            assert((rc.repo as BitBucketServerRepoRef).scheme === "https://");
            assert(rc.repo.sha === "bb94dbf2a40b3754f2e62797c80923b938f60fb3");
        });

    });

});
