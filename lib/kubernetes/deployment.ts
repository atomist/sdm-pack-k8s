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
    logger,
    webhookBaseUrl,
} from "@atomist/automation-client";
import * as k8s from "@kubernetes/client-node";
import * as http from "http";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { logRetry } from "../support/retry";
import {
    applicationLabels,
    matchLabels,
} from "./labels";
import { metadataTemplate } from "./metadata";
import {
    appName,
    KubernetesApplication,
    KubernetesDeleteResourceRequest,
    KubernetesResourceRequest,
} from "./request";

export interface UpsertDeploymentResponse {
    response: http.IncomingMessage;
    body: k8s.V1Deployment;
}

/**
 * Create or update a deployment for a Kubernetes application.
 *
 * @param req Kuberenetes application request
 * @return response from the Kubernetes API.
 */
export async function upsertDeployment(req: KubernetesResourceRequest): Promise<UpsertDeploymentResponse> {
    const slug = appName(req);
    try {
        await req.clients.apps.readNamespacedDeployment(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read deployment ${slug}, creating: ${e.message}`);
        const dep = await deploymentTemplate(req);
        logger.debug(`Creating deployment ${slug} using '${stringify(dep)}'`);
        return logRetry(() => req.clients.apps.createNamespacedDeployment(req.ns, dep),
            `create deployment ${slug}`);
    }
    const patch = deploymentPatch(req);
    logger.debug(`Updating deployment ${slug} using '${stringify(patch)}'`);
    return logRetry(() => req.clients.apps.patchNamespacedDeployment(req.name, req.ns, patch),
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
        logger.debug(`Deployment ${slug} does not exist: ${e.message}`);
        return;
    }
    const body: k8s.V1DeleteOptions = { propagationPolicy: "Background" } as any;
    await logRetry(() => req.clients.apps.deleteNamespacedDeployment(req.name, req.ns, body),
        `delete deployment ${slug}`);
    return;
}

/**
 * Create deployment patch for a repo and image.  If the request has a
 * `deploymentSpec`, it is merged into the patch created by this
 * function using `lodash.merge(default, req.deploymentSpec)`.
 *
 * @param req deployment template request
 * @return deployment resource patch
 */
export function deploymentPatch(req: KubernetesApplication): Partial<k8s.V1Deployment> {
    const patch: Partial<k8s.V1Deployment> = {
        spec: {
            template: {
                spec: {
                    containers: [
                        {
                            name: req.name,
                            image: req.image,
                        },
                    ],
                },
            },
        },
    } as any; // avoid https://github.com/kubernetes-client/javascript/issues/87
    if (req.replicas) {
        patch.spec.replicas = req.replicas;
    }
    if (req.deploymentSpec) {
        _.merge(patch, req.deploymentSpec);
    }
    return patch;
}

/**
 * Create deployment spec for a Kubernetes application.  If the
 * request has a `deploymentSpec`, it is merged into the patch created
 * by this function using `lodash.merge(default, req.deploymentSpec)`.
 *
 * @param req Kubernetes application request
 * @return deployment resource specification
 */
export async function deploymentTemplate(req: KubernetesApplication): Promise<k8s.V1Deployment> {
    const k8ventAnnot = stringify({
        environment: req.environment,
        webhooks: [`${webhookBaseUrl()}/atomist/kube/teams/${req.workspaceId}`],
    });
    const labels = await applicationLabels(req);
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
    const d: k8s.V1Deployment = {
        apiVersion: "extensions/v1beta1",
        kind: "Deployment",
        metadata,
        spec: {
            replicas: (req.replicas || req.replicas === 0) ? req.replicas : 1,
            revisionHistoryLimit: 3,
            selector,
            template: {
                metadata: podMetadata,
                spec: {
                    containers: [
                        {
                            name: req.name,
                            image: req.image,
                            imagePullPolicy: "IfNotPresent",
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
                    dnsPolicy: "ClusterFirst",
                    restartPolicy: "Always",
                },
            },
            strategy: {
                type: "RollingUpdate",
                rollingUpdate: {
                    maxUnavailable: 0,
                    maxSurge: 1,
                },
            },
        },
    } as any; // avoid https://github.com/kubernetes-client/javascript/issues/87
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
        d.spec.template.spec.imagePullSecrets = [{ name: req.imagePullSecret }];
    }
    if (req.deploymentSpec) {
        _.merge(d, req.deploymentSpec);
    }
    return d;
}
