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
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { DeepPartial } from "ts-essentials";
import { errMsg } from "../support/error";
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
    KubernetesSdm,
} from "./request";
import { stringifyObject } from "./resource";

/**
 * Create or update a deployment for a Kubernetes application.  Any
 * provided `req.deploymentSpec` is merged using
 * [[deploymentTemplate]] before creating/patching.
 *
 * @param req Kuberenetes application request
 * @return Kubernetes spec used to create/update resource
 */
export async function upsertDeployment(req: KubernetesResourceRequest): Promise<k8s.V1Deployment> {
    const slug = appName(req);
    const spec = await deploymentTemplate(req);
    try {
        await req.clients.apps.readNamespacedDeployment(req.name, req.ns);
    } catch (e) {
        logger.debug(`Failed to read deployment ${slug}, creating: ${errMsg(e)}`);
        logger.info(`Creating deployment ${slug} using '${stringifyObject(spec)}'`);
        await logRetry(() => req.clients.apps.createNamespacedDeployment(req.ns, spec),
            `create deployment ${slug}`);
        return spec;
    }
    logger.info(`Updating deployment ${slug} using '${stringifyObject(spec)}'`);
    await logRetry(() => req.clients.apps.patchNamespacedDeployment(req.name, req.ns, spec), `patch deployment ${slug}`);
    return spec;
}

/**
 * Delete a deployment if it exists.  If the resource does not exist,
 * do nothing.
 *
 * @param req Kuberenetes application delete request
 * @return deleted object or undefined if resource does not exist
 */
export async function deleteDeployment(req: KubernetesDeleteResourceRequest): Promise<k8s.V1Deployment | undefined> {
    const slug = appName(req);
    let dep: k8s.V1Deployment;
    try {
        const resp = await req.clients.apps.readNamespacedDeployment(req.name, req.ns);
        dep = resp.body;
    } catch (e) {
        logger.debug(`Deployment ${slug} does not exist: ${errMsg(e)}`);
        return undefined;
    }
    logger.info(`Deleting deployment ${slug}`);
    const opts: k8s.V1DeleteOptions = { propagationPolicy: "Background" } as any;
    await logRetry(() => req.clients.apps.deleteNamespacedDeployment(req.name, req.ns, undefined, opts),
        `delete deployment ${slug}`);
    return dep;
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
        namespace: req.ns,
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
    const apiVersion = "apps/v1";
    const kind = "Deployment";
    // avoid https://github.com/kubernetes-client/javascript/issues/52
    const d: DeepPartial<k8s.V1Deployment> = {
        apiVersion,
        kind,
        metadata,
        spec: {
            replicas: (req.replicas || req.replicas === 0) ? req.replicas : 1,
            selector,
            strategy: {
                type: "RollingUpdate",
                rollingUpdate: {
                    maxUnavailable: 0,
                    maxSurge: 1,
                },
            },
            template: {
                metadata: podMetadata,
                spec: {
                    containers: [
                        {
                            image: req.image,
                            name: req.name,
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
        },
    };
    if (req.port) {
        d.spec.template.spec.containers[0].ports = [
            {
                name: "http",
                containerPort: req.port,
            } as any,
        ];
        const probe: k8s.V1Probe = {
            httpGet: {
                path: "/",
                port: "http",
            },
            initialDelaySeconds: 30,
        } as any;
        d.spec.template.spec.containers[0].readinessProbe = probe;
        d.spec.template.spec.containers[0].livenessProbe = probe;
    }
    if (req.imagePullSecret) {
        d.spec.template.spec.imagePullSecrets = [{ name: req.imagePullSecret }];
    }
    if (req.roleSpec) {
        d.spec.template.spec.serviceAccountName = _.get(req, "serviceAccountSpec.metadata.name", req.name);
    }
    if (req.deploymentSpec) {
        _.merge(d, req.deploymentSpec, { apiVersion, kind });
    }
    return d as k8s.V1Deployment;
}
