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
    logger,
    Project,
} from "@atomist/automation-client";
import {
    execPromise,
    GoalInvocation,
    SdmGoalEvent,
} from "@atomist/sdm";
import {
    isInLocalMode,
    readSdmVersion,
} from "@atomist/sdm-core";
import * as k8s from "@kubernetes/client-node";
import * as dockerfileParser from "docker-file-parser";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { DeepPartial } from "ts-essentials";
import { defaultNamespace } from "../kubernetes/namespace";
import { KubernetesApplication } from "../kubernetes/request";
import { defaultEnvironment } from "./environment";
import {
    goalEventSlug,
    KubernetesDeploy,
    KubernetesDeployRegistration,
} from "./goal";
import { loadKubernetesSpec } from "./spec";

/**
 * JSON propery under the goal event data where the
 * [[KubernetesDeployment]] goal [[KubernetesApplication]] data are
 * stored, i.e., the value of `goal.data[sdmPackK8s]`.
 */
export const sdmPackK8s = "sdm-pack-k8s";

/**
 * Generate KubernetesApplication from project and goal invocation.
 * This function used [[defaultDeploymentData]] to produce initial
 * [[KubernetesApplication]] data.  It then merges in any object
 * provided by `goalEvent.data[[[sdmPackk8]]]`, with the latter taking
 * precedence.  Then, if `registration.applicationData` is truthy, it
 * calls that function and merges the results into
 * `goalEvent.data[[[sdmPackk8]]]`, with the function result taking
 * precedence.
 *
 * @param k8Deploy Kubernetes deployment goal
 * @param registration Goal registration/configuration for `k8Deploy`
 * @param goalInvocation The Kubernetes deployment goal currently triggered.
 * @return The SdmGoalEvent augmented with [[KubernetesApplication]] in the data
 */
export function generateKubernetesGoalEventData(
    k8Deploy: KubernetesDeploy,
    registration: KubernetesDeployRegistration,
    goalInvocation: GoalInvocation,
): Promise<SdmGoalEvent> {
    return k8Deploy.sdm.configuration.sdm.projectLoader.doWithProject({ ...goalInvocation, readOnly: true }, async p => {

        const { context, goalEvent } = goalInvocation;
        const defaultData: any = {};
        defaultData[sdmPackK8s] = await defaultDeploymentData(p, goalEvent, k8Deploy, context);

        const slug = goalEventSlug(goalEvent);
        let eventData: any;
        try {
            eventData = JSON.parse(goalEvent.data || "{}");
        } catch (e) {
            logger.warn(`Failed to parse goal event data for ${slug} as JSON: ${e.message}`);
            logger.warn(`Ignoring current value of goal event data: ${goalEvent.data}`);
            eventData = {};
        }
        const mergedData = _.merge(defaultData, eventData);

        if (registration.applicationData) {
            const callbackData = await registration.applicationData(p, mergedData[sdmPackK8s], k8Deploy, goalEvent);
            mergedData[sdmPackK8s] = callbackData;
        }

        goalEvent.data = JSON.stringify(mergedData);
        return goalEvent;
    });
}

/**
 * Fetch [[KubernetesApplication]] from goal event.  If the goal event
 * does not contain Kubernetes application information in its data
 * property, `undefined` is returned.  If the value of the goal event
 * data cannot be parsed as JSON, an error is thrown.
 *
 * @param goalEvent SDM goal event to retrieve the Kubernetes application data from
 * @return Parsed [[KubernetesApplication]] object
 */
export function getKubernetesGoalEventData(goalEvent: SdmGoalEvent): KubernetesApplication | undefined {
    if (!goalEvent || !goalEvent.data) {
        return undefined;
    }
    let data: any;
    try {
        data = JSON.parse(goalEvent.data);
    } catch (e) {
        e.message = `Failed to parse goal event data (${goalEvent.data}): ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    if (!data[sdmPackK8s]) {
        return undefined;
    }
    return data[sdmPackK8s];
}

/**
 * Given the project, event, [[KubernetesDeployment]] goal, and
 * handler context generate a default [[KubernetesApplication]] object
 * that should be suitable for deploying simple, microservices.
 *
 * If the SDM configuration contains a `k8s.app` property, i.e.,
 * `k8Deploy.sdm.configuration.sdm.k8s.app`, it is used as the basis
 * for the default [[KubernetesApplication]] object.
 *
 * This function reads partial Kubernetes specs from the
 * `.atomist/kubernetes` directory of the project, if any exist.
 * Specifically it looks for JSON and YAML files with the base names
 * "deployment", "service", "ingress", "role", "service-account", and
 * "role-binding".
 *
 * It also uses [[defaultEnvironment]], [[defaultImage]],
 * [[dockerPort]], and [[defaultIngress]] to further populated default
 * property values from information in the repository and event.
 *
 * Any values obtained from the repository/project/event/goal override
 * those in the SDM configuration `k8s` property.
 *
 * @param p Project being deployed
 * @param goalEvent SDM Kubernetes deployment goal event
 * @param k8Deploy Kubernetes deployment goal configuration
 * @param context Handler context
 * @return a valid default KubernetesApplication for this SDM goal deployment event
 */
export async function defaultDeploymentData(
    p: GitProject,
    goalEvent: SdmGoalEvent,
    k8Deploy: KubernetesDeploy,
    context: HandlerContext,
): Promise<KubernetesApplication> {

    const configAppData: Partial<KubernetesApplication> =
        (k8Deploy.sdm.configuration.sdm && k8Deploy.sdm.configuration.sdm.k8s && k8Deploy.sdm.configuration.sdm.k8s.app) ?
            k8Deploy.sdm.configuration.sdm.k8s.app : {};

    const workspaceId = context.workspaceId;
    const environment = defaultEnvironment(goalEvent, k8Deploy);
    const name = goalEvent.repo.name;
    const ns = configAppData.ns || environment || defaultNamespace;
    const image = await defaultImage(goalEvent, k8Deploy, context);
    const port = await dockerPort(p);
    const appIngress = await defaultIngress(goalEvent, k8Deploy);

    const deploymentSpec: DeepPartial<k8s.V1Deployment> = await loadKubernetesSpec(p, "deployment");
    const serviceSpec: DeepPartial<k8s.V1Service> = await loadKubernetesSpec(p, "service");
    const ingressSpec: DeepPartial<k8s.V1beta1Ingress> = await loadKubernetesSpec(p, "ingress");
    const roleSpec: DeepPartial<k8s.V1Role> = await loadKubernetesSpec(p, "role");
    const serviceAccountSpec: DeepPartial<k8s.V1ServiceAccount> = await loadKubernetesSpec(p, "service-account");
    const roleBindingSpec: DeepPartial<k8s.V1RoleBinding> = await loadKubernetesSpec(p, "role-binding");

    const repoAppData: KubernetesApplication = {
        ...appIngress,
        workspaceId,
        environment,
        name,
        ns,
        image,
        port,
        deploymentSpec,
        serviceSpec,
        ingressSpec,
        roleSpec,
        serviceAccountSpec,
        roleBindingSpec,
    };

    return _.merge(configAppData, repoAppData);
}

/**
 * Parse Dockerfile and return port of first argument to the first
 * EXPOSE command.  it can suggessfully convert to an integer.  If
 * there are no EXPOSE commands or if it cannot successfully convert
 * the EXPOSE arguments to an integer, `undefined` is returned.
 *
 * @param p Project to look for Dockerfile in
 * @return port number or `undefined` if no EXPOSE commands are found
 */
export async function dockerPort(p: Project): Promise<number | undefined> {
    const dockerFile = await p.getFile("Dockerfile");
    if (dockerFile) {
        const dockerFileContents = await dockerFile.getContent();
        const commands = dockerfileParser.parse(dockerFileContents, { includeComments: false });
        const exposeCommands = commands.filter(c => c.name === "EXPOSE");
        for (const exposeCommand of exposeCommands) {
            if (Array.isArray(exposeCommand.args)) {
                for (const arg of exposeCommand.args) {
                    const port = parseInt(arg, 10);
                    if (!isNaN(port)) {
                        return port;
                    }
                }
            } else if (typeof exposeCommand.args === "string") {
                const port = parseInt(exposeCommand.args, 10);
                if (!isNaN(port)) {
                    return port;
                }
            } else {
                logger.warn(`Unexpected EXPOSE argument type '${typeof exposeCommand.args}': ${stringify(exposeCommand.args)}`);
            }
        }
    }
    return undefined;
}

/**
 * Remove any invalid characters from Docker image name component
 * `name` to make it a valid Docker image name component.  If
 * `hubOwner` is true, it ensures the name contains only alphanumeric
 * characters.
 *
 * From https://docs.docker.com/engine/reference/commandline/tag/:
 *
 * > An image name is made up of slash-separated name components,
 * > optionally prefixed by a registry hostname. The hostname must
 * > comply with standard DNS rules, but may not contain
 * > underscores. If a hostname is present, it may optionally be
 * > followed by a port number in the format :8080. If not present,
 * > the command uses Docker’s public registry located at
 * > registry-1.docker.io by default. Name components may contain
 * > lowercase letters, digits and separators. A separator is defined
 * > as a period, one or two underscores, or one or more dashes. A
 * > name component may not start or end with a separator.
 * >
 * > A tag name must be valid ASCII and may contain lowercase and
 * > uppercase letters, digits, underscores, periods and dashes. A tag
 * > name may not start with a period or a dash and may contain a
 * > maximum of 128 characters.
 *
 * @param name Name component to clean up.
 * @param hubOwner If `true` only allow characters valid for a Docker Hub user/org
 * @return Valid Docker image name component.
 */
function dockerImageNameComponent(name: string, hubOwner: boolean = false): string {
    const cleanName = name.toLocaleLowerCase().replace(/^[^a-z0-9]+/, "").replace(/[^a-z0-9]+$/, "").replace(/[^-_/.a-z0-9]+/g, "");
    if (hubOwner) {
        return cleanName.replace(/[^a-z0-9]+/, "");
    } else {
        return cleanName;
    }
}

/**
 * Determine the best default value for the image property for this
 * Kubernetes deployment goal event.  If there is no image associated
 * with the after commit of the push, it checks if a Docker registry
 * is provided at `sdm.configuration.sdm.docker.registry` and uses
 * that and the repo name to return an image.  If neither of those
 * exist, a Docker Hub-like image name generated from the repository
 * owner and name.  In the latter two cases, it tries to read a
 * version for this commit from the graph.  If it exists it uses it at
 * the image tag.  If it does not, it uses the tag "latest".
 *
 * @param goalEvent SDM Kubernetes deployment goal event
 * @param k8Deploy Kubernetes deployment goal object
 * @param context Handler context
 * @return best value for the environment property
 */
export async function defaultImage(goalEvent: SdmGoalEvent, k8Deploy: KubernetesDeploy, context: HandlerContext): Promise<string> {
    if (goalEvent.push && goalEvent.push.after && goalEvent.push.after.images && goalEvent.push.after.images.length > 0) {
        return goalEvent.push.after.images[0].imageName;
    }
    const slug = goalEventSlug(goalEvent);
    let version: string;
    try {
        version = await readSdmVersion(goalEvent.repo.owner, goalEvent.repo.name, goalEvent.repo.providerId, goalEvent.sha,
            goalEvent.branch, context);
    } catch (e) {
        logger.warn(`Failed to read version for goal ${slug}:${goalEvent.sha}: ${e.message}`);
        version = "latest";
    }
    const tag = version.replace(/^[-.]/, "").replace(/[^-.\w]+/, "").substring(0, 128);
    const dockerName = dockerImageNameComponent(goalEvent.repo.name);
    if (k8Deploy.sdm.configuration.sdm && k8Deploy.sdm.configuration.sdm.docker && k8Deploy.sdm.configuration.sdm.docker.registry) {
        return `${k8Deploy.sdm.configuration.sdm.docker.registry}/${dockerName}:${tag}`;
    } else {
        const hubOwner = dockerImageNameComponent(goalEvent.repo.owner, true);
        return `${hubOwner}/${dockerName}:${tag}`;
    }
}

/**
 * Provide reasonable ingress-related configuration defaults for SDM
 * local mode.  If not in local mode, it returns `undefined`.
 *
 * @param goalEvent SDM Kubernetes deployment goal event
 * @param k8Deploy Kubernetes deployment goal object
 * @return best value for the environment property
 */
export async function defaultIngress(goalEvent: SdmGoalEvent, k8Deploy: KubernetesDeploy): Promise<Partial<KubernetesApplication>> {
    if (!isInLocalMode()) {
        return undefined;
    }
    let host: string;
    try {
        const minikubeIpResult = await execPromise("minikube", ["ip"]);
        host = minikubeIpResult.stdout.trim();
    } catch (e) {
        logger.debug(`Failed to run 'minikube ip': ${e.message}`);
    }
    host = host || "127.0.0.1";
    const environment = defaultEnvironment(goalEvent, k8Deploy);
    const slug = goalEventSlug(goalEvent);
    const path = `/${environment}/${slug}`;
    return {
        host,
        protocol: "http",
        path,
    };
}
