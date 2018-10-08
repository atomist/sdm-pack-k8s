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

import {
    spawnAndWatch,
    SuccessIsReturn0ErrorFinder,
} from "@atomist/automation-client";
import {
    AnyPush,
    DefaultGoalNameGenerator,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    FulfillmentRegistration,
    getGoalDefinitionFrom,
    Goal,
    GoalEnvironment,
    IndependentOfEnvironment,
    ProductionEnvironment,
    Project,
    RepoContext,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
    StagingEnvironment,
    StringCapturingProgressLog,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import * as _ from "lodash";
import {
    Deployment,
    Service,
} from "./api";
import { executeKubernetesDeploy } from "./deploy";
import {
    KubernetesDeploymentOptions,
    readKubernetesSpec,
} from "./goalSetup";

/**
 * Registration to pass to KubernetesDeploy goal to describe the deployment metadata
 */
export interface KubernetesDeployRegistration extends FulfillmentRegistration {

    /**
     * Create the raw deployment data (name, ns, environment, ingress etc)
     */
    deploymentData?: (goal: SdmGoalEvent, context: RepoContext) => Promise<KubernetesDeploymentOptions>;

    /**
     * Create the service spec patch for this application
     */
    serviceSpecCreator?: (serviceSpec: Service, goal: SdmGoalEvent, context: RepoContext) => Promise<Service>;

    /**
     * Create the deployment spec path
     */
    deploymentSpecCreator?: (deploymentSpec: Deployment, goal: SdmGoalEvent, context: RepoContext) => Promise<Deployment>;
}

/**
 * Goal that deploys an application to a Kubernetes cluster by using a direct deploy in SDM local mode or
 * triggers deploy via k8-automation for non-local mode use.
 */
export class KubernetesDeploy extends FulfillableGoalWithRegistrations<KubernetesDeployRegistration> {

    constructor(public readonly details?: {
                    environment: "testing" | "production" | string,
                } & FulfillableGoalDetails,
                ...dependsOn: Goal[]) {

        super({
            ...getGoalDefinitionFrom(details, DefaultGoalNameGenerator.generateName("k8-deploy")),
            displayName: `deploy${getEnvironmentLabel(details)}`,
            environment: getEnvironment(details),
            completedDescription: `Deployed${getEnvironmentLabel(details)}`,
            failedDescription: `Deployment${getEnvironmentLabel(details)} failed`,
            waitingForApprovalDescription: `Successfully deployed${getEnvironmentLabel(details)}`,
        }, ...dependsOn);
    }

    /**
     * Register a deployment with all required callbacks
     */
    public with(registration: KubernetesDeployRegistration): this {
        if (isInLocalMode()) {
            this.addFulfillment({
                name: registration.name,
                goalExecutor: executeKubernetesDeploy(),
                pushTest: registration.pushTest,
            });
        } else {
            this.addFulfillment({
                name: "@atomist/k8-automation",
                pushTest: registration.pushTest,
            });
        }

        this.addFulfillmentCallback({
            goal: this,
            callback: kubernetesDataCallback(this, registration),
        });
        return this;
    }

    /**
     * Convenience method to register a deployment
     */
    public withDeployment(deploymentData?:
                              (goal: SdmGoalEvent, context: RepoContext) => Promise<KubernetesDeploymentOptions>,
                          serviceSpecCreator?:
                              (serviceSpec: Service, goal: SdmGoalEvent, context: RepoContext) => Promise<Service>,
                          deploymentSpecCreator?:
                              (deploymentSpec: Deployment, goal: SdmGoalEvent, context: RepoContext) => Promise<Deployment>): this {
        this.with({
            name: DefaultGoalNameGenerator.generateName("k8-deployer"),
            deploymentData,
            serviceSpecCreator,
            deploymentSpecCreator,
        });
        return this;
    }

    /**
     * Called by the SDM on initialization
     */
    public register(sdm: SoftwareDeliveryMachine) {
        super.register(sdm);

        // Register a startup listener to add the default deployment if no dedicated got registered
        sdm.addStartupListener(async () => {
            if (this.fulfillments.length === 0 &&
                this.callbacks.length === 0) {
                // Register the default deployment
                this.with({ name: "k8-deploy-default", pushTest: AnyPush });
            }
        });
    }
}

function kubernetesDataCallback(k8Deploy: KubernetesDeploy,
                                registration: KubernetesDeployRegistration)
    : (goal: SdmGoalEvent, context: RepoContext) => Promise<SdmGoalEvent> {

    return async (goal, ctx) => {
        return k8Deploy.sdm.configuration.sdm.projectLoader.doWithProject({
            credentials: ctx.credentials, id: ctx.id, context: ctx.context, readOnly: true,
        }, async p => {

            let deploymentSpec = JSON.parse(
                (await readKubernetesSpec(p, "deployment.json")) || "{}") as Deployment;
            if (registration.deploymentSpecCreator) {
                deploymentSpec = await registration.deploymentSpecCreator(deploymentSpec, goal, ctx);
            }

            let serviceSpec = JSON.parse((await readKubernetesSpec(p, "service.json")) || "{}") as Service;
            if (registration.serviceSpecCreator) {
                serviceSpec = await registration.serviceSpecCreator(serviceSpec, goal, ctx);
            }

            let deploymentData;
            if (registration.deploymentData) {
                deploymentData = await registration.deploymentData(goal, ctx);
            } else {
                deploymentData = await defaultDeploymentData(p, goal, ctx, k8Deploy);
            }

            if (!deploymentData.environment) {
                deploymentData.environment = k8Deploy.sdm.configuration.environment;
            }

            return {
                ...goal,
                data: JSON.stringify({
                    ...JSON.parse(goal.data || "{}"),
                    kubernetes: {
                        ...deploymentData,
                        deploymentSpec: JSON.stringify(deploymentSpec),
                        serviceSpec: JSON.stringify(serviceSpec),
                    },
                }),
            };
        });
    };
}

/**
 * Default deployment data callback that reads the Dockerfile and uses EXPOSE instructions to setup
 * ingress rules.
 */
export async function defaultDeploymentData(p: Project,
                                            goal: SdmGoalEvent,
                                            ctx: RepoContext,
                                            k8Deploy: KubernetesDeploy): Promise<KubernetesDeploymentOptions> {
    const configuration = k8Deploy.sdm.configuration;
    const details = k8Deploy.details;
    const ns = details && details.environment ? details.environment : "default";
    let ingress: Partial<KubernetesDeploymentOptions> = {};

    if (await p.hasFile("Dockerfile")) {
        const df = await p.getFile("Dockerfile");
        const parser = require("docker-file-parser");
        const options = { includeComments: false };

        const commands = parser.parse(await df.getContent(), options);
        const exposeCommands = commands.filter((c: any) => c.name === "EXPOSE");

        if (exposeCommands.length > 1) {
            throw new Error(`Unable to determine port for default ingress. Dockerfile in project '${goal.repo.owner}/${
                goal.repo.name}' has more then one EXPOSE instruction: ${exposeCommands.map((c: any) => c.args).join(", ")}`);
        } else if (exposeCommands.length === 1) {
            let host = "sdm.info";
            let path = `/${ns}/${goal.repo.owner}/${goal.repo.name}`;
            if (_.get(configuration, "sdm.k8.ingress.host")) {
                host = _.get(configuration, "sdm.k8.ingress.host");
            } else if (_.get(configuration, "sdm.k8.context") === "minikube") {
                // Attempt to load the minikube ip and use that to construct a hostname
                const log = new StringCapturingProgressLog();
                const result = await spawnAndWatch({
                        command: "minikube",
                        args: ["ip"],
                    },
                    {}
                    ,
                    log,
                    {
                        errorFinder: SuccessIsReturn0ErrorFinder,
                        logCommand: false,
                    },
                );

                if (result.code === 0) {
                    host = `${goal.repo.name}.${goal.repo.owner}.${ns}.${log.log.trim()}.nip.io`;
                    path = "/";
                }
            }
            ingress = {
                host,
                port: +exposeCommands[0].args[0],
                protocol: "http",
                path,
            };
        }
    }

    return {
        name: goal.repo.name,
        environment: configuration.environment,

        ns,
        ...ingress,
    };
}

function getEnvironmentLabel(details?: { environment?: string }): string {
    if (details && details.environment && typeof details.environment === "string") {
        switch (details.environment) {
            case "testing":
                return " to `testing`";
            case "production":
                return " to `production`";
            default:
                return ` to \`${details.environment}\``;
        }
    } else if (details && details.environment) {
        switch (details.environment) {
            case StagingEnvironment:
                return " to `testing`";
            case ProductionEnvironment:
                return " to `production`";
            default:
                return "";
        }
    } else {
        return "";
    }
}

function getEnvironment(details?: { environment?: string }): GoalEnvironment {
    if (details && details.environment && typeof details.environment === "string") {
        switch (details.environment) {
            case "testing":
                return StagingEnvironment;
            case "production":
                return ProductionEnvironment;
            default:
                return IndependentOfEnvironment;
        }
    } else if (details && details.environment) {
        return details.environment as GoalEnvironment;
    } else {
        return IndependentOfEnvironment;
    }
}
