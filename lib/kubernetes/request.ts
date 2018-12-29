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

import * as k8s from "@kubernetes/client-node";
import { KubernetesClients } from "./clients";

/**
 * Role-based access control resources associated with an application.
 */
export interface KubernetesApplicationRbac {
    /**
     * Partial role to create for binding to service account.  This
     * partial spec is overlaid onto the default role spec.  If this
     * is not defined, no RBAC or service account resources are
     * managed for this application.
     */
    roleSpec: Partial<k8s.V1Role>;
    /**
     * Partial service account spec to create, bind to the role,
     * and use by the deployment.  This partial spec is overlaid
     * onto the default service account spec.
     */
    serviceAccountSpec?: Partial<k8s.V1ServiceAccount>;
    /**
     * Partial binding of role to service account.  This partial
     * spec is overlaid onto the default role binding spec.
     */
    roleBindingSpec?: Partial<k8s.V1RoleBinding>;
}

/**
 * Information used to construct resources when creating or updating
 * an application in a Kubernetes cluster.
 */
export interface KubernetesApplication {
    /** Atomist workspace ID */
    workspaceId: string;
    /** Arbitrary name of environment */
    environment: string;
    /** Name of resources to create */
    name: string;
    /** Namespace to create resources in */
    ns: string;
    /** Full image name and tag for deployment pod template container */
    image: string;
    /**
     * Name of image pull secret for container image, if not provided
     * no image pull secret is provided in the pod spec.
     */
    imagePullSecret?: string;
    /**
     * Port the service listens on, if not provided no service
     * resource is created.
     */
    port?: number;
    /**
     * Ingress rule URL path, if not provided no ingress rule is
     * added.
     */
    path?: string;
    /**
     * Ingress rule hostname, if not provided none is used in the
     * ingress rule, meaning it will apply to the wildcard host, and
     * "localhost" is used when constructing the service endpoint URL.
     */
    host?: string;
    /**
     * Ingress protocol, "http" or "https".  If tslSecret is provided,
     * the default is "https", otherwise "http".
     */
    protocol?: "http" | "https";
    /** Name of TLS secret for host */
    tlsSecret?: string;
    /**
     * Partial deployment spec for this application that is overlaid
     * on top of the default deployment spec template.
     */
    deploymentSpec?: Partial<k8s.V1Deployment>;
    /**
     * Partial service spec for this application that is overlaid on
     * top of the default service spec template.
     */
    serviceSpec?: Partial<k8s.V1Service>;
    /**
     * Partial ingress spec for this application that is overlaid on
     * top of the default ingress spec template.
     */
    ingressSpec?: Partial<k8s.V1beta1Ingress>;
    /**
     * Number of replicas in deployment.  May be overridden by
     * deploymentSpec.
     */
    replicas?: number;
    /**
     * Secrets to upsert prior to creating deployment.
     */
    secrets?: k8s.V1Secret[];
    /**
     * Role-based access control resources that should be associated
     * with the application.
     */
    rbac?: KubernetesApplicationRbac;
}

/**
 * Information needed to delete resources related to an application in
 * a Kubernetes cluster.
 */
export type KubernetesDelete = Pick<KubernetesApplication, "name" | "ns" | "workspaceId">;

/**
 * Intermediate interface for use in combination with other
 * interfaces.
 */
export interface KubernetesConfigContainer {
    /** Kubernetes configuration */
    config: k8s.KubeConfig;
}

/**
 * Information needed to create an application in a Kubernetes
 * cluster.
 */
export type KubernetesApplicationRequest = KubernetesApplication & KubernetesConfigContainer;

/**
 * Information needed to delete an application from a Kubernetes
 * cluster.
 */
export type KubernetesDeleteRequest = KubernetesDelete & KubernetesConfigContainer;

/**
 * Intermediate interface for use in combination with other
 * interfaces.
 */
export interface KubernetesClientsContainer {
    /** Kubernetes API group clients. */
    clients: KubernetesClients;
}

/**
 * Internal application structure used to create or update resources
 * in a Kubernetes cluster.
 */
export type KubernetesResourceRequest = KubernetesApplication & KubernetesClientsContainer;

/**
 * Internal application structure used to delete resources from a
 * Kubernetes cluster.
 */
export type KubernetesDeleteResourceRequest = KubernetesDelete & KubernetesClientsContainer;

/** Qualified name of Kubernetes application */
export function appName(k: Pick<KubernetesApplication, "name" | "ns">): string {
    return `${k.ns}/${k.name}`;
}
