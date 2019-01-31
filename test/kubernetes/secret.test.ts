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
import * as assert from "power-assert";
import {
    applicationSecrets,
    encodeSecret,
    secretTemplate,
} from "../../lib/kubernetes/secret";
import { pkgInfo } from "./pkg";

describe("kubernetes/secret", () => {

    describe("applicationSecrets", () => {

        it("should return the application secrets", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                ns: "hounds-of-love",
                name: "cloudbusting",
            };
            const s: k8s.V1Secret[] = [
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "number-five",
                        labels: {
                            "app.kubernetes.io/managed-by": "kate-bush",
                            "app.kubernetes.io/name": r.name,
                            "app.kubernetes.io/part-of": r.name,
                            "app.kubernetes.io/component": "secret",
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                        guitar: "QWxhbiBNdXJwaHk=",
                        bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                        drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                        strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "ylt",
                        labels: {
                            "app.kubernetes.io/managed-by": "bss",
                            "app.kubernetes.io/name": "musical-collective",
                            "app.kubernetes.io/part-of": "musical-collective",
                            "app.kubernetes.io/component": "secret",
                        },
                    },
                    data: {
                        brokenSocialScene: "QSBDYW5hZGlhbiBtdXNpY2FsIGNvbGxlY3RpdmUuCg==",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "numero-cinco",
                        labels: {
                            "app.kubernetes.io/name": r.name,
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                    },
                },
            ] as any;
            const a = applicationSecrets(r, s);
            const e = [
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "number-five",
                        labels: {
                            "app.kubernetes.io/managed-by": "kate-bush",
                            "app.kubernetes.io/name": r.name,
                            "app.kubernetes.io/part-of": r.name,
                            "app.kubernetes.io/component": "secret",
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                        guitar: "QWxhbiBNdXJwaHk=",
                        bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                        drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                        strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "numero-cinco",
                        labels: {
                            "app.kubernetes.io/name": r.name,
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                    },
                },
            ];
            assert.deepStrictEqual(a, e);
        });

        it("should handle an empty list of secrets", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                ns: "hounds-of-love",
                name: "cloudbusting",
            };
            const s: k8s.V1Secret[] = [];
            const a = applicationSecrets(r, s);
            assert.deepStrictEqual(a, s);
        });

        it("should return no application secrets", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                ns: "hounds-of-love",
                name: "cloudbusting",
            };
            const s: k8s.V1Secret[] = [
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "number-five",
                        labels: {
                            "app.kubernetes.io/managed-by": "kate-bush",
                            "app.kubernetes.io/name": "cloudbursting",
                            "app.kubernetes.io/part-of": r.name,
                            "app.kubernetes.io/component": "secret",
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                        guitar: "QWxhbiBNdXJwaHk=",
                        bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                        drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                        strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "ylt",
                    },
                    data: {
                        brokenSocialScene: "QSBDYW5hZGlhbiBtdXNpY2FsIGNvbGxlY3RpdmUuCg==",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "numero-cinco",
                        labels: {
                            "app.kubernetes.io/name": r.name,
                            "atomist.com/workspaceId": "AN0T43RW5",
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                    },
                },
            ] as any;
            const a = applicationSecrets(r, s);
            assert.deepStrictEqual(a, []);
        });

        it("should return all application secrets", () => {
            const r = {
                workspaceId: "KAT3BU5H",
                ns: "hounds-of-love",
                name: "cloudbusting",
            };
            const s: k8s.V1Secret[] = [
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "number-five",
                        labels: {
                            "app.kubernetes.io/managed-by": "kate-bush",
                            "app.kubernetes.io/name": r.name,
                            "app.kubernetes.io/part-of": r.name,
                            "app.kubernetes.io/component": "secret",
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                        guitar: "QWxhbiBNdXJwaHk=",
                        bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                        drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                        strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Secret",
                    type: "Opaque",
                    metadata: {
                        name: "numero-cinco",
                        labels: {
                            "app.kubernetes.io/name": r.name,
                            "atomist.com/workspaceId": r.workspaceId,
                        },
                    },
                    data: {
                        piano: "S2F0ZSBCdXNo",
                    },
                },
            ] as any;
            const a = applicationSecrets(r, s);
            assert.deepStrictEqual(a, s);
        });
    });

    describe("secretTemplate", () => {

        let pv: string;
        before(async () => {
            pv = await pkgInfo();
        });

        it("should return a valid secret spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
            };
            const p: k8s.V1Secret = {
                metadata: {
                    name: "musicians",
                },
                data: {
                    piano: "S2F0ZSBCdXNo",
                    guitar: "QWxhbiBNdXJwaHk=",
                    bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                    drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                    strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                },
            } as any;
            const s = await secretTemplate(r, p);
            const e = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    name: p.metadata.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "app.kubernetes.io/component": "secret",
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                data: {
                    piano: "S2F0ZSBCdXNo",
                    guitar: "QWxhbiBNdXJwaHk=",
                    bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                    drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                    strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                },
            };
            assert.deepStrictEqual(s, e);
        });

        it("should return a custom secret spec", async () => {
            const r = {
                workspaceId: "KAT3BU5H",
                ns: "hounds-of-love",
                name: "cloudbusting",
                image: "gcr.io/kate-bush/hounds-of-love/cloudbusting:5.5.10",
                port: 5510,
            };
            const p: k8s.V1Secret = {
                metadata: {
                    annotations: {
                        "studio-album": "5",
                        "studios": `["Wickham Farm Home Studio", "Windmill Lane Studios", "Abbey Road Studios"]`,
                    },
                    labels: {
                        "app.kubernetes.io/component": "double-secret",
                        "app.kubernetes.io/version": "1.2.3",
                    },
                    name: "musicians",
                },
                data: {
                    piano: "S2F0ZSBCdXNo",
                    guitar: "QWxhbiBNdXJwaHk=",
                    bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                    drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                    strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                },
            } as any;
            const s = await secretTemplate(r, p);
            const e = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    annotations: {
                        "studio-album": "5",
                        "studios": `["Wickham Farm Home Studio", "Windmill Lane Studios", "Abbey Road Studios"]`,
                    },
                    name: p.metadata.name,
                    labels: {
                        "app.kubernetes.io/managed-by": pv,
                        "app.kubernetes.io/name": r.name,
                        "app.kubernetes.io/part-of": r.name,
                        "app.kubernetes.io/component": "double-secret",
                        "app.kubernetes.io/version": "1.2.3",
                        "atomist.com/workspaceId": r.workspaceId,
                    },
                },
                data: {
                    piano: "S2F0ZSBCdXNo",
                    guitar: "QWxhbiBNdXJwaHk=",
                    bass: "RGVsIFBhbG1lciwgTWFydGluIEdsb3ZlciwgRWJlcmhhcmQgV2ViZXI=",
                    drums: "U3R1YXJ0IEVsbGlvdHQgJiBDaGFybGllIE1vcmdhbg==",
                    strings: "VGhlIE1lZGljaSBTZXh0ZXQ=",
                },
            };
            assert.deepStrictEqual(s, e);
        });

    });

    describe("encodeSecret", () => {

        it("should encode a secret value", () => {
            const s = {
                "yo-la-tengo": `{"albums":["Ride the Tiger","New Wave Hot Dogs","President Yo La Tengo","Fakebook"]}`,
            };
            const k = encodeSecret("ylt", s);
            const e = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    name: "ylt",
                },
                data: {
                    "yo-la-tengo": "eyJhbGJ1bXMiOlsiUmlkZSB0aGUgVGlnZXIiLCJOZXcgV2F2ZSBIb3QgRG9ncyIsIlByZXNpZGVudCBZbyBMYSBUZW5nbyIsIkZha2Vib29rIl19",
                },
            };
            assert.deepStrictEqual(k, e);
        });

        it("should encode a few secret values", () => {
            const s = {
                "yo-la-tengo": `{"albums":["Ride the Tiger","New Wave Hot Dogs","President Yo La Tengo","Fakebook"]}`,
                "brokenSocialScene": "A Canadian musical collective.\n",
            };
            const k = encodeSecret("feel", s);
            const e = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    name: "feel",
                },
                data: {
                    "yo-la-tengo": "eyJhbGJ1bXMiOlsiUmlkZSB0aGUgVGlnZXIiLCJOZXcgV2F2ZSBIb3QgRG9ncyIsIlByZXNpZGVudCBZbyBMYSBUZW5nbyIsIkZha2Vib29rIl19",
                    "brokenSocialScene": "QSBDYW5hZGlhbiBtdXNpY2FsIGNvbGxlY3RpdmUuCg==",
                },
            };
            assert.deepStrictEqual(k, e);
        });

        it("should create an empty data secret", () => {
            const s = {};
            const k = encodeSecret("nada", s);
            const e = {
                apiVersion: "v1",
                kind: "Secret",
                type: "Opaque",
                metadata: {
                    name: "nada",
                },
                data: {},
            };
            assert.deepStrictEqual(k, e);
        });

    });

});
