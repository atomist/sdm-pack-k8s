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
    logger,
    webhookBaseUrl,
} from "@atomist/automation-client";
import * as k8s from "@kubernetes/client-node";
import * as http from "http";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import {DeepPartial} from "ts-essentials";
import {errMsg} from "../support/error";
import {logRetry} from "../support/retry";
import {
    applicationLabels,
    matchLabels,
} from "./labels";
import {metadataTemplate} from "./metadata";
import {
    appName,
    KubernetesApplication,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
    KubernetesSdm,
} from "./request";

export interface UpsertDeploymentResponse {
    response: http.IncomingMessage;
    body: k8s.V1Deployment;
}

/**
 * Create or update a deployment for a Kubernetes application.  Any
 * provided `req.deploymentSpec` is merged using
 * [[deploymentTemplate]] before creating/patching.
 *
 * @param req Kuberenetes application request
 * @return response from the Kubernetes API.
 */
export async function upsertDeployment(req: KubernetesResourceRequest): Promise<UpsertDeploymentResponse> {
    const slug = appName(req);
    const spec = await deploymentTemplate(req);
    try {
        await req.clients.apps.readNamespacedDeployment(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read deployment ${slug}, creating: ${errMsg(e)}`);
        logger.debug(`Creating deployment ${slug} using '${stringify(spec)}'`);
        return logRetry(() => req.clients.apps.createNamespacedDeployment(req.ns, spec),
            `create deployment ${slug}`);
    }
    logger.debug(`Updating deployment ${slug} using '${stringify(spec)}'`);
    return logRetry(() => req.clients.apps.patchNamespacedDeployment(req.name, req.ns, spec),
        `patch deployment ${slug}`);
}

/**
 * Delete a deployment if it exists.  If the resource does not exist,
 * do nothing.
 *
 * @param req Kuberenetes delete request
 */
export async function deleteDeployment(req: KubernetesDeleteResourceRequest): Promise<void> {
    const slug = appName(req);
    try {
        await req.clients.apps.readNamespacedDeployment(req.name, req.ns);
    } catch (e) {
        logger.debug(`Deployment ${slug} does not exist: ${errMsg(e)}`);
        return;
    }
    const body: k8s.V1DeleteOptions = {propagationPolicy: "Background"} as any;
    await logRetry(() => req.clients.apps.deleteNamespacedDeployment(req.name, req.ns, "", body),
        `delete deployment ${slug}`);
    return;
}

/**
 * Rollback a deployment if it exists. If the resource does not exist,
 * do nothing.
 *
 * @param req Kubernetes delete request
 */
export async function rollbackDeployment(req: KubernetesDeleteResourceRequest): Promise<void> {
    const slug = appName(req);
    try {
        await req.clients.apps.readNamespacedDeployment(req.name, req.ns);
    } catch (e) {
        logger.debug(`Deployment ${slug} does not exist: ${errMsg(e)}`);
        return;
    }
    const body: k8s.ExtensionsV1beta1DeploymentRollback = {
        apiVersion: "apps/v1beta1",
        kind: "Rollback",
        name: req.name,
        rollbackTo: {revision: 0},
        updatedAnnotations: undefined,
    };
    await logRetry(() => req.clients.ext.createNamespacedDeploymentRollback(req.name, req.ns, body),
        `rollback deployment ${slug}`).then(status => logger.info(status.response.statusMessage));
    return;
}

/**
 * Validate that a deployment has been correctly deployed to k8. If the resource
 * does not exit, do nothing.
 *
 * https://github.com/kubernetes-client/python/issues/571#issuecomment-405890791
 *
 * @param req KubernetesDeleteRequest
 * @param timeout Number in milliseconds
 */
export async function kubeImageValidate(req: KubernetesDeleteResourceRequest, timeout: number): Promise<boolean> {
    const slug = appName(req);
    try {
        const start = Date.now();

        while (Date.now() - start < timeout) {
            const response = await req.clients.apps.readNamespacedDeploymentStatus(req.name, req.ns);
            const status = response.body.status;
            await new Promise(resolve => setTimeout(resolve, 5000));
            if (status.updatedReplicas === response.body.spec.replicas &&
                status.replicas === response.body.spec.replicas &&
                status.availableReplicas === response.body.spec.replicas &&
                status.observedGeneration >= response.body.metadata.generation) {
                return true;
            }
        }
    } catch (e) {
        logger.debug(`Deployment ${slug} does not exist: ${errMsg(e)}`);
    }
    return false;
}

/**
 * Create deployment spec for a Kubernetes application.  If the
 * request has a `deploymentSpec`, it is merged into the default spec
 * created by this function using `lodash.merge(default, req.deploymentSpec)`.
 *
 * @param req Kubernetes application request
 * @return deployment resource specification
 */
export async function deploymentTemplate(req: KubernetesApplication & KubernetesSdm): Promise<k8s.V1Deployment> {
    const k8ventAnnot = stringify({
        webhooks: [`${webhookBaseUrl()}/atomist/kube/teams/${req.workspaceId}`],
    });
    const labels = applicationLabels(req);
    const matchers = matchLabels(req);
    const metadata = metadataTemplate({
        name: req.name,
        labels,
    });
    const podMetadata = metadataTemplate({
        name: req.name,
        labels,
        annotations: {
            "atomist.com/k8vent": k8ventAnnot,
        },
    });
    const selector: k8s.V1LabelSelector = {
        matchLabels: matchers,
    } as any;
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const d: DeepPartial<k8s.V1Deployment> = {
        apiVersion: "apps/v1",
        kind: "Deployment",
        metadata,
        spec: {
            replicas: (req.replicas || req.replicas === 0) ? req.replicas : 1,
            selector,
            template: {
                metadata: podMetadata,
                spec: {
                    containers: [
                        {
                            name: req.name,
                            image: req.image,
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
                },
            },
            strategy: {
                type: "RollingUpdate",
                rollingUpdate: {
                    maxUnavailable: 0 as any, // DeepPartial or TypeScript bug?
                    maxSurge: 1 as any,
                },
            },
        },
    };
    if (req.port) {
        d.spec.template.spec.containers[0].ports = [
            {
                name: "http",
                containerPort: req.port,
                protocol: "TCP",
            } as any,
        ];
        const probe: k8s.V1Probe = {
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
        } as any;
        d.spec.template.spec.containers[0].readinessProbe = probe;
        d.spec.template.spec.containers[0].livenessProbe = probe;
    }
    if (req.imagePullSecret) {
        d.spec.template.spec.imagePullSecrets = [{name: req.imagePullSecret}];
    }
    if (req.roleSpec) {
        d.spec.template.spec.serviceAccountName = _.get(req, "serviceAccountSpec.metadata.name", req.name);
    }
    if (req.deploymentSpec) {
        _.merge(d, req.deploymentSpec);
    }
    return d as k8s.V1Deployment;
}
