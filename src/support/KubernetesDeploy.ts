import {
    AnyPush,
    Configuration,
    DefaultGoalNameGenerator,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    FulfillmentRegistration,
    getGoalDefintionFrom,
    GoalEnvironment,
    IndependentOfEnvironment,
    ProductionEnvironment,
    Project,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
    StagingEnvironment,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import { RepoContext } from "@atomist/sdm/api/context/SdmContext";
import { Goal } from "@atomist/sdm/api/goal/Goal";
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

export interface KubernetesDeployRegistration extends FulfillmentRegistration {
    deploymentData?: (goal: SdmGoalEvent, context: RepoContext) => Promise<KubernetesDeploymentOptions>;
    serviceSpecCreator?: (serviceSpec: Service, goal: SdmGoalEvent, context: RepoContext) => Promise<Service>;
    deploymentSpecCreator?: (deploymentSpec: Deployment, goal: SdmGoalEvent, context: RepoContext) => Promise<Deployment>;
}

export class KubernetesDeploy extends FulfillableGoalWithRegistrations<KubernetesDeployRegistration> {

    constructor(details?: {
                    environment: "testing" | "production" | string,
                } & FulfillableGoalDetails,
                ...dependsOn: Goal[]) {

        super({
            ...getGoalDefintionFrom(details, DefaultGoalNameGenerator.generateName("k8-deploy")),
            displayName: `deploy${getEnvironmentLabel(details)}`,
            environment: getEnvironment(details),
            completedDescription: `Deployed${getEnvironmentLabel(details)}`,
            failedDescription: `Deployment${getEnvironmentLabel(details)} failed`,
            waitingForApprovalDescription: `Successfully deployed${getEnvironmentLabel(details)}`,
        }, ...dependsOn);
    }

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

    public withDeployment(deploymentData?:
                              (goal: SdmGoalEvent, context: RepoContext) => Promise<KubernetesDeploymentOptions>,
                          serviceSpecCreator?:
                              (serviceSpec: Service, goal: SdmGoalEvent, context: RepoContext) => Promise<Service>,
                          deploymentSpecCreator?:
                              (deploymentSpec: Deployment, goal: SdmGoalEvent, context: RepoContext) => Promise<Deployment>): this {
        this.with({
            name: DefaultGoalNameGenerator.generateName(this.definition.uniqueName),
            deploymentData,
            serviceSpecCreator,
            deploymentSpecCreator,
        });
        return this;
    }

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

            let deploymentSpec = (await readKubernetesSpec(p, "deployment.json") as any) || {} as Deployment;
            if (registration.deploymentSpecCreator) {
                deploymentSpec = await registration.deploymentSpecCreator(deploymentSpec, goal, ctx);
            }

            let serviceSpec = (await readKubernetesSpec(p, "service.json") as any) || {} as Service;
            if (registration.serviceSpecCreator) {
                serviceSpec = await registration.serviceSpecCreator(serviceSpec, goal, ctx);
            }

            let deploymentData;
            if (registration.deploymentData) {
                deploymentData = await registration.deploymentData(goal, ctx);
            } else {
                deploymentData = await defaultDeploymentData(p, goal, ctx, k8Deploy.sdm.configuration);
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

export async function defaultDeploymentData(p: Project,
                                            goal: SdmGoalEvent,
                                            ctx: RepoContext,
                                            configuration: Configuration): Promise<KubernetesDeploymentOptions> {
    let ingress: Partial<KubernetesDeploymentOptions> = {};
    if (await p.hasFile("Dockerfile")) {
        const df = await p.getFile("Dockerfile");
        const parser = require("docker-file-parser");
        const options = { includeComments: false };

        const commands = parser.parse(await df.getContent(), options);
        const exposeCommands = commands.filter(c => c.name === "EXPOSE");
        if (exposeCommands.length >= 2) {
            throw new Error(`Unable to determine port for default ingress. Dockerfile in project '${goal.repo.owner}/${
                goal.repo.name}' has more then one EXPOSE instruction: ${exposeCommands.map(c => c.args).join(", ")}`);
        } else if (exposeCommands.length === 1) {
            ingress = {
                host: _.get(configuration, "sdm.k8.ingress.host") || "sdm.info",
                port: +exposeCommands[0].args[0],
                protocol: "http",
                path: `/${goal.repo.owner}/${goal.repo.name}`,
            };
        }
    }

    return {
        name: goal.repo.name,
        environment: configuration.environment,

        ns: `atm-${goal.repo.owner}`,
        ...ingress,
    };
}

function getEnvironmentLabel(details?: { environment?: string }): string {
    if (details && details.environment) {
        switch (details.environment) {
            case "testing":
                return " to `testing`";
            case "production":
                return " to `production`";
            default:
                return ` to \`${details.environment}\``;
        }
    } else {
        return IndependentOfEnvironment;
    }
}

function getEnvironment(details?: { environment?: string }): GoalEnvironment {
    if (details && details.environment) {
        switch (details.environment) {
            case "testing":
                return StagingEnvironment;
            case "production":
                return ProductionEnvironment;
        }
    } else {
        return IndependentOfEnvironment;
    }
}
