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

import { InMemoryProject } from "@atomist/automation-client/project/mem/InMemoryProject";
import { KubernetesDeploymentOptions } from "../../src";
import { defaultDeploymentData } from "../../src/support/KubernetesDeploy";
import assert = require("power-assert");

describe("KubernetesDeploy", () => {

    describe("defaultDeploymentData", () => {

        it("should return deployment data without ingress", async () => {
            const goal = {
                repo: {
                    owner: "atomist",
                    name: "sdm",
                },
            } as any;
            const p = InMemoryProject.of();
            const conf = {
                details: {
                    environment: "demo",
                },
                sdm: {
                    configuration: {
                        environment: "demo",
                        sdm: {
                            ingress: {
                                host: "demo.com",
                            },
                        },
                    },
                },
            };
            const dd = await defaultDeploymentData(p, goal, null, conf as any);
            const exp = {
                name: "sdm",
                environment: "demo",
                ns: "demo",
            };
            assert.deepEqual(dd, exp);
        });

        const DockerfileWithOneExpose = `FROM openjdk:8

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && dpkg -i dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && rm -f dumb-init_\${DUMB_INIT_VERSION}_amd64.deb

MAINTAINER Atomist <docker@atomist.com>

RUN mkdir -p /opt/app

WORKDIR /opt/app

EXPOSE 8080

CMD ["-jar", "spring-boot.jar"]

ENTRYPOINT ["dumb-init", "java", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseCGroupMemoryLimitForHeap", "-Xmx256m", "-Djava.security.egd=file:/dev/urandom"]

COPY target/spring-boot.jar spring-boot.jar`;


        it("should return deployment data with ingress from Dockerfile", async () => {
            const goal = {
                repo: {
                    owner: "atomist",
                    name: "sdm",
                },
            } as any;
            const p = InMemoryProject.of({ path: "Dockerfile", content: DockerfileWithOneExpose });
            const conf = {
                details: {
                    environment: "demo",
                },
                sdm: {
                    configuration: {
                        environment: "demo",
                        sdm: {
                            ingress: {
                                host: "demo.com",
                            },
                        },
                    },
                },
            };
            const dd = await defaultDeploymentData(p, goal, null, conf as any);
            const exp = {
                name: "sdm",
                host: "sdm.info",
                environment: "demo",
                ns: "demo",
                port: 8080,
                path: "/demo/atomist/sdm",
                protocol: "http",
            } as KubernetesDeploymentOptions;
            assert.deepStrictEqual(dd, exp);
        });

        const DockerfileWithSeveralExpose = `FROM openjdk:8

ENV DUMB_INIT_VERSION=1.2.1

RUN curl -s -L -O https://github.com/Yelp/dumb-init/releases/download/v$DUMB_INIT_VERSION/dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && dpkg -i dumb-init_\${DUMB_INIT_VERSION}_amd64.deb \\
    && rm -f dumb-init_\${DUMB_INIT_VERSION}_amd64.deb

MAINTAINER Atomist <docker@atomist.com>

RUN mkdir -p /opt/app

WORKDIR /opt/app

EXPOSE 8080
EXPOSE 8081
EXPOSE 8082

CMD ["-jar", "spring-boot.jar"]

ENTRYPOINT ["dumb-init", "java", "-XX:+UnlockExperimentalVMOptions", "-XX:+UseCGroupMemoryLimitForHeap", "-Xmx256m", "-Djava.security.egd=file:/dev/urandom"]

COPY target/spring-boot.jar spring-boot.jar`;


        it("should fail to return deployment data with ingress from Dockerfile", async () => {
            const goal = {
                repo: {
                    owner: "atomist",
                    name: "sdm",
                },
            } as any;
            const conf = {
                details: {
                    environment: "demo",
                },
                sdm: {
                    configuration: {
                        environment: "demo",
                        sdm: {
                            ingress: {
                                host: "demo.com",
                            },
                        },
                    },
                },
            } as any;
            const p = InMemoryProject.of({ path: "Dockerfile", content: DockerfileWithSeveralExpose });
            try {
                await defaultDeploymentData(p, goal, null, conf);
                assert.fail();
            } catch (err) {
                assert(err.message.includes("Unable to determine port for default ingress"));
            }
        });

    });

});