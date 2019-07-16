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

import { logger } from "@atomist/automation-client";
import * as k8s from "@kubernetes/client-node";
import * as _ from "lodash";
import { errMsg } from "../support/error";
import {
    isClusterResource,
    K8sObject,
    K8sObjectApi,
} from "./api";
import {
    KubernetesClients,
    makeApiClients,
} from "./clients";
import { loadKubeConfig } from "./config";

/** Kubernetes resource type specifier. */
export interface KubernetesResourceKind {
    /** Kubernetes API version, e.g., "v1" or "apps/v1". */
    apiVersion: string;
    /** Kubernetes resource, e.g., "Service" or "Deployment". */
    kind: string;
}

/**
 * Various ways to select Kubernetes resources.  If a property is not
 * provided, it is not considered in the selection.  So if you just
 * provide an empty object, all resources will be returned.
 */
export interface KubernetesResourceSelector {
    /**
     * Whether this selector is for inclusion or exclusion.
     * If not provided, the rule will be used for inclusion.
     */
    action?: "include" | "exclude";
    /**
     * If provided, only resources of a kind provided will be
     * returned.  If not provided,
     * [[defaultKubernetesResourceSelectorKinds]] is used.
     */
    kinds?: KubernetesResourceKind[];
    /**
     * If provided, only resources with names matching either
     * the entire string or regular expression will be returned.
     */
    name?: string | RegExp;
    /**
     * If provided, only resources in namespaces matching either
     * the entire strings or regular expression will be returned.
     */
    namespace?: string | RegExp;
    /**
     * Kubernetes-style label selectors.  If provided, only resources
     * matching the selectors are returned.
     */
    selector?: k8s.V1LabelSelector;
}

/**
 * Default set of kinds of Kubernetes resource returned.
 */
export const defaultKubernetesResourceSelectorKinds: KubernetesResourceKind[] = [
    { apiVersion: "v1", kind: "ConfigMap" },
    { apiVersion: "v1", kind: "Secret" },
    { apiVersion: "v1", kind: "Service" },
    { apiVersion: "v1", kind: "ServiceAccount" },
    { apiVersion: "v1", kind: "PersistentVolume" },
    { apiVersion: "v1", kind: "PersistentVolumeClaim" },
    { apiVersion: "extensions/v1beta1", kind: "Ingress" },
    { apiVersion: "extensions/v1beta1", kind: "PodSecurityPolicy" },
    { apiVersion: "apps/v1", kind: "DaemonSet" },
    { apiVersion: "apps/v1", kind: "Deployment" },
    { apiVersion: "apps/v1", kind: "StatefulSet" },
    { apiVersion: "autoscaling/v1", kind: "HorizontalPodAutoscaler" },
    { apiVersion: "batch/v1beta1", kind: "CronJob" },
    { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy" },
    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRole" },
    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding" },
    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role" },
    { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding" },
    { apiVersion: "storage.k8s.io/v1", kind: "StorageClass" },
];

/**
 * Kubernetes fetch options specifying which resources to fetch.
 */
export interface KubernetesFetchOptions {
    /**
     * Array of Kubernetes resource selectors.  The selectors are
     * processed in order, each processing the array of objects
     * returned by the previous selector, or, for the first selector,
     * all resources in the Kubernetes cluster matching any resource
     * kind in an include selector.
     */
    selectors?: KubernetesResourceSelector[];
}

/**
 * The default options used when fetching resource from a Kubernetes
 * cluster.  By default it fetches resources whose kind is in the
 * [[defaultKubernetesResourceSelectorKinds]] array that are not in a
 * namespace that starts with "kube-", excluding the `kubernetes`
 * service in the `default` namespace.
 */
export const defaultKubernetesFetchOptions: KubernetesFetchOptions = {
    selectors: [
        { action: "exclude", namespace: /^kube-/ },
        { action: "exclude", kinds: [{ apiVersion: "v1", kind: "Service" }], namespace: "default", name: "kubernetes" },
    ],
};

/**
 * Fetch resource specs from a Kubernetes cluster as directed by the
 * fetch options, removing read-only properties filled by the API.
 *
 * @param options Kubernetes fetch options.
 */
export async function kubernetesFetch(options: KubernetesFetchOptions = defaultKubernetesFetchOptions): Promise<K8sObject[]> {
    let client: K8sObjectApi;
    let clients: KubernetesClients;
    try {
        const kc = loadKubeConfig();
        client = kc.makeApiClient(K8sObjectApi);
        clients = makeApiClients(kc);
    } catch (e) {
        e.message = `Failed to create Kubernetes client: ${errMsg(e)}`;
        logger.error(e.message);
        throw e;
    }

    const selectors = populateResourceSelectorDefaults(options.selectors);
    // const includedApiKinds = selectors.filter(s => s.action === "include").map(s => s.kinds);
    const clusterResources = extractClusterResources(selectors);
    const specs: K8sObject[] = [];

    for (const apiKind of clusterResources) {
        try {
            const obj = apiObject(apiKind);
            const listResponse = await client.list(obj);
            specs.push(...listResponse.body.items.map(cleanKubernetesSpec));
        } catch (e) {
            e.message = `Failed to list cluster resources ${apiKind.apiVersion}/${apiKind.kind}: ${e.message}`;
            logger.error(e.message);
            throw e;
        }
    }

    let namespaces: string[];
    try {
        const nsResponse = await clients.core.listNamespace();
        namespaces = nsResponse.body.items.map((ns: K8sObject) => ns.metadata.name);
    } catch (e) {
        e.message = `Failed to list namespaces: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    for (const ns of namespaces) {
        for (const selector of selectors) {
            for (const apiKind of selector.kinds) {
                try {
                    const obj = apiObject(apiKind, ns);
                    const listResponse = await client.list(obj);
                    specs.push(...listResponse.body.items.map(cleanKubernetesSpec));
                } catch (e) {
                    e.message = `Failed to list resources ${apiKind.apiVersion}/${apiKind.kind} in namespace ${ns}: ${e.message}`;
                    logger.error(e.message);
                    throw e;
                }
            }
        }
    }

    return filterKubernetesResources(specs, selectors);
}

/**
 * Make sure action and kinds property are populated with default values.
 */
export function populateResourceSelectorDefaults(selectors: KubernetesResourceSelector[]): KubernetesResourceSelector[] {
    return selectors.map(s => ({
        action: "include",
        kinds: defaultKubernetesResourceSelectorKinds,
        ...s,
    }));
}

/**
 * Determine all Kuberenetes resources that we should query based on
 * all the selectors and return an array with each Kubernetes resource
 * type appearing no more than once.  Note that uniqueness of a
 * Kubernetes resource type is determined solely by the `kind`
 * property, `apiVersion` is not considered since the same resource
 * can be found with the same kind and different API versions.
 *
 * @param selectors All the resource selectors
 * @return A uniqified array of Kubernetes resources that among the inclusion rules
 */
export function selectedResourceKinds(selectors: KubernetesResourceSelector[]): KubernetesResourceKind[] {
    // const includeSelectors = selectors.filter(s => s.action === "include");
    // return _.uniq(_.flatten(selectors.filter(s => s.action === "include").map(s => s.kinds.map(k => k.kind))));
    return [];
}

/**
 * Return the uniquified array of KubernetesResourceKinds from the
 * selectors.
 *
 * @param selectors The selectors containing all the Kubernetes resource API kinds
 * @return The API kinds from selectors that are  Kubernetes cluster resources
 */
export function extractClusterResources(selectors: KubernetesResourceSelector[]): KubernetesResourceKind[] {
    const kinds = _.uniq(_.flatten(selectors.map(s => s.kinds)));
    return kinds.filter(ak => isClusterResource("list", ak.kind));
}

/**
 * Construct Kubernetes resource object for use with client API.
 */
function apiObject(apiKind: KubernetesResourceKind, ns?: string): K8sObject {
    const ko: K8sObject = {
        apiVersion: apiKind.apiVersion,
        kind: apiKind.kind,
    };
    if (ns) {
        ko.metadata = {
            namespace: ns,
        };
    }
    return ko;
}

/**
 * Remove read-only type properties not useful to retain in a resource
 * specification used for upserting resources.  This is probably not
 * perfect.
 *
 * @param obj Kubernetes spec to clean
 * @return Kubernetes spec with status-like properties removed
 */
export function cleanKubernetesSpec(obj: k8s.KubernetesObject): K8sObject {
    if (!obj) {
        return obj;
    }
    const spec: any = obj;
    if (spec.metadata) {
        delete spec.metadata.creationTimestamp;
        delete spec.metadata.generation;
        delete spec.metadata.resourceVersion;
        delete spec.metadata.selfLink;
        delete spec.metadata.uid;
        if (spec.metadata.annotations) {
            delete spec.metadata.annotations["deployment.kubernetes.io/revision"];
            delete spec.metadata.annotations["kubectl.kubernetes.io/last-applied-configuration"];
            if (Object.keys(spec.metadata.annotations).length < 1) {
                delete spec.metadata.annotations;
            }
        }
    }
    if (spec.spec && spec.spec.template && spec.spec.template.metadata) {
        delete spec.spec.template.metadata.creationTimestamp;
    }
    delete spec.status;
    return spec;
}

/**
 * Filter provided Kubernetes resources according to the provides
 * selectors.
 *
 * @param specs Kubernetes resources to filter
 * @param selectors Filtering rules
 * @return Filtered array of Kubernetes resources
 */
export function filterKubernetesResources(specs: K8sObject[], selectors: KubernetesResourceSelector[]): K8sObject[] {
    const uniqueSpecs = _.uniqBy(specs, kubernetesResourceIdentity);
    const filteredSpecs: K8sObject[] = [];
    for (const spec of uniqueSpecs) {
        for (const selector of selectors) {
            if (selectorMatch(spec, selector)) {
                filteredSpecs.push(spec);
                break;
            }
        }
    }
    return filteredSpecs;
}

/**
 * Reduce a Kubernetes resource to its uniquely identifying
 * properties.  Note that `apiVersion` is not among them as identical
 * resources can be access via different API versions, e.g.,
 * Deployment via app/v1 and extensions/v1beta1.
 *
 * @param obj Kubernetes resource
 * @return Stripped down resource for unique identification
 */
export function kubernetesResourceIdentity(obj: K8sObject): string {
    return `${obj.kind}|` + (obj.metadata.namespace ? `${obj.metadata.namespace}|` : "") + obj.metadata.name;
}

/**
 * Determine if Kubernetes resource is a match against the selector.
 *
 * @param spec Kubernetes resource to check
 * @param selector Selector to use for checking
 * @return `true` if spec matches selector
 */
export function selectorMatch(spec: K8sObject, selector: KubernetesResourceSelector): boolean {
    return false;
}
