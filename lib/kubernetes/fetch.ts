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
import { DeepPartial } from "ts-essentials";
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
import { labelMatch } from "./labels";
import { nameMatch } from "./name";

/** Kubernetes resource type specifier. */
export interface KubernetesResourceKind {
    /** Kubernetes API version, e.g., "v1" or "apps/v1". */
    apiVersion: string;
    /** Kubernetes resource, e.g., "Service" or "Deployment". */
    kind: string;
}

/**
 * Various ways to select Kubernetes resources.  All means provided
 * are logically ANDed together.
 */
export interface KubernetesResourceSelector {
    /**
     * Whether this selector is for inclusion or exclusion.
     * If not provided, the rule will be used for inclusion.
     */
    action?: "include" | "exclude";
    /**
     * If provided, only resources of a kind provided will be
     * considered a match.  See [[populateResourceSelectorDefaults]] for
     * rules on how it is populated if it is not set.
     */
    kinds?: KubernetesResourceKind[];
    /**
     * If provided, only resources with names matching either the
     * entire string or regular expression will be considered a match.  If not
     * provided, the resource name is not considered when matching.
     */
    name?: string | RegExp;
    /**
     * If provided, only resources in namespaces matching either the
     * entire strings or regular expression will be considered a match.  If not
     * provided, the resource namespace is not considered when
     * matching.
     */
    namespace?: string | RegExp;
    /**
     * Kubernetes-style label selectors.  If provided, only resources
     * matching the selectors are considered a match.  If not provided, the
     * resource labels are not considered when matching.
     */
    labelSelector?: DeepPartial<k8s.V1LabelSelector>;
    /**
     * If provided, resources will be considered a match if their
     * filter function returns `true`.   If not provided, this property
     * has no effect on matching.
     */
    filter?: (r: K8sObject) => boolean;
}

/**
 * Useful default set of kinds of Kubernetes resources.
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
    { apiVersion: "policy/v1beta1", kind: "PodDisruptionBudget" },
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
     * applied in order to each resource and the action of the first
     * matching selector is applied.
     */
    selectors?: KubernetesResourceSelector[];
}

/**
 * The default options used when fetching resource from a Kubernetes
 * cluster.  By default it fetches resources whose kind is in the
 * [[defaultKubernetesResourceSelectorKinds]] array, excluding the
 * resources that look like Kubernetes managed resources like the
 * `kubernetes` service in the `default` namespace, resources in
 * namespaces that starts with "kube-", and system- and cloud-related
 * cluster roles and cluster role bindings.
 */
export const defaultKubernetesFetchOptions: KubernetesFetchOptions = {
    selectors: [
        { action: "exclude", namespace: /^kube-/ },
        { action: "exclude", name: /^(?:kubeadm|system):/ },
        { action: "exclude", kinds: [{ apiVersion: "v1", kind: "Service" }], namespace: "default", name: "kubernetes" },
        { action: "exclude", kinds: [{ apiVersion: "v1", kind: "ServiceAccount" }], name: "default" },
        {
            action: "exclude",
            kinds: [{ apiVersion: "rbac.authorization.k8s.io", kind: "ClusterRole" }],
            name: /^(?:(?:cluster-)?admin|edit|view|cloud-provider)$/,
        },
        {
            action: "exclude",
            kinds: [{ apiVersion: "rbac.authorization.k8s.io", kind: "ClusterRoleBinding" }],
            name: /^(?:cluster-admin(?:-binding)?|cloud-provider|kubernetes-dashboard)$/,
        },
        { action: "exclude", kinds: [{ apiVersion: "storage.k8s.io/v1", kind: "StorageClass" }], name: "standard" },
        { action: "exclude", filter: (r: any) => r.kind === "Secret" && r.type === "kubernetes.io/service-account-token" },
        { action: "exclude", filter: r => /^ClusterRole/.test(r.kind) && /(?:kubelet|:)/.test(r.metadata.name) },
        { action: "include", kinds: defaultKubernetesResourceSelectorKinds },
    ],
};

/**
 * Fetch resource specs from a Kubernetes cluster as directed by the
 * fetch options, removing read-only properties filled by the
 * Kubernetes system.
 *
 * The inclusion selectors are processed to determine which resources
 * in the Kubernetes cluster to query.
 *
 * @param options Kubernetes fetch options
 * @return Kubernetes resources matching the fetch options
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
    const clusterResources = clusterResourceKinds(selectors);
    const specs: K8sObject[] = [];

    for (const apiKind of clusterResources) {
        try {
            const obj = apiObject(apiKind);
            const listResponse = await client.list(obj);
            specs.push(...listResponse.body.items.map(s => cleanKubernetesSpec(s, apiKind)));
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
        const apiKinds = namespaceResourceKinds(ns, selectors);
        for (const apiKind of apiKinds) {
            try {
                const obj = apiObject(apiKind, ns);
                const listResponse = await client.list(obj);
                specs.push(...listResponse.body.items.map(s => cleanKubernetesSpec(s, apiKind)));
            } catch (e) {
                e.message = `Failed to list resources ${apiKind.apiVersion}/${apiKind.kind} in namespace ${ns}: ${e.message}`;
                logger.error(e.message);
                throw e;
            }
        }
    }

    return selectKubernetesResources(specs, selectors);
}

/**
 * Make sure Kubernetes resource selectors have appropriate properties
 * populated with default values.  If the selector does not have an
 * `action` set, it is set to "include".  If the selector does not have
 * `kinds` set and `action` is "include", `kinds` is set to
 * [[defaultKubernetesResourceSelectorKinds]].  Rules with `action` set
 * to "exclude" and have no selectors are discarded.
 *
 * @param selectors Kubernetes resource selectors to ensure have default values
 * @return Properly defaulted Kubernetes resource selectors
 */
export function populateResourceSelectorDefaults(selectors: KubernetesResourceSelector[]): KubernetesResourceSelector[] {
    return selectors.map(s => {
        const k: KubernetesResourceSelector = { action: "include", ...s };
        if (!k.kinds && k.action === "include") {
            k.kinds = defaultKubernetesResourceSelectorKinds;
        }
        return k;
    }).filter(s => s.action === "include" || s.filter || s.kinds || s.labelSelector || s.name || s.namespace);
}

/**
 * Determine all Kuberenetes cluster, i.e., not namespaced, resources
 * that we should query based on all the selectors and return an array
 * with each Kubernetes cluster resource type appearing no more than
 * once.  Note that uniqueness of a Kubernetes resource type is
 * determined solely by the `kind` property, `apiVersion` is not
 * considered since the same resource can be found with the same kind
 * and different API versions.
 *
 * @param selectors All the resource selectors
 * @return A deduplicated array of Kubernetes cluster resource kinds among the inclusion rules
 */
export function clusterResourceKinds(selectors: KubernetesResourceSelector[]): KubernetesResourceKind[] {
    const included = includedResourceKinds(selectors);
    return included.filter(ak => isClusterResource("list", ak.kind));
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
 * @return A deduplicated array of Kubernetes resource kinds among the inclusion rules
 */
export function includedResourceKinds(selectors: KubernetesResourceSelector[]): KubernetesResourceKind[] {
    const includeSelectors = selectors.filter(s => s.action === "include");
    const includeKinds = _.flatten(includeSelectors.map(s => s.kinds));
    const uniqueKinds = _.uniqBy(includeKinds, "kind");
    return uniqueKinds;
}

/**
 * For the provided set of selectors, return a deduplicated array of
 * resource kinds, using the same logic as [[includedResourceKinds]].
 *
 * @param ns Namespace to check
 * @param selectors Selectors to evaluate
 * @return A deduplicated array of Kubernetes resource kinds among the inclusion rules for namespace `ns`
 */
export function namespaceResourceKinds(ns: string, selectors: KubernetesResourceSelector[]): KubernetesResourceKind[] {
    const apiKinds: KubernetesResourceKind[] = [];
    for (const selector of selectors.filter(s => s.action === "include")) {
        if (nameMatch(ns, selector.namespace)) {
            apiKinds.push(...selector.kinds.filter(ak => !isClusterResource("list", ak.kind)));
        }
    }
    return _.uniqBy(apiKinds, "kind");
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
        ko.metadata = { namespace: ns };
    }
    return ko;
}

/**
 * Remove read-only type properties not useful to retain in a resource
 * specification used for upserting resources.  This is probably not
 * perfect.  Add the `apiVersion` and `kind` properties since the they
 * are not included in the items returned by the list endpoint,
 * https://github.com/kubernetes/kubernetes/issues/3030 .
 *
 * @param obj Kubernetes spec to clean
 * @return Kubernetes spec with status-like properties removed
 */
export function cleanKubernetesSpec(obj: k8s.KubernetesObject, apiKind: KubernetesResourceKind): K8sObject {
    if (!obj) {
        return obj;
    }
    const spec: any = { ...apiKind, ...obj };
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
 * selectors.  Each selector is applied in turn to each spec.  The
 * action of the first selector that matches a resource is applied to
 * that resource.  If no selector matches a resource, it is not
 * returned, i.e., the default is to exclude.
 *
 * @param specs Kubernetes resources to filter
 * @param selectors Filtering rules
 * @return Filtered array of Kubernetes resources
 */
export function selectKubernetesResources(specs: K8sObject[], selectors: KubernetesResourceSelector[]): K8sObject[] {
    const uniqueSpecs = _.uniqBy(specs, kubernetesResourceIdentity);
    if (!selectors || selectors.length < 1) {
        return uniqueSpecs;
    }
    const filteredSpecs: K8sObject[] = [];
    for (const spec of uniqueSpecs) {
        for (const selector of selectors) {
            const action = selectorMatch(spec, selector);
            if (action === "include") {
                filteredSpecs.push(spec);
                break;
            } else if (action === "exclude") {
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
 * If there is a match, return the action of the selector.  If there
 * is not a match, return `undefined`.
 *
 * @param spec Kubernetes resource to check
 * @param selector Selector to use for checking
 * @return Selector action if there is a match, `undefined` otherwise
 */
export function selectorMatch(spec: K8sObject, selector: KubernetesResourceSelector): "include" | "exclude" | undefined {
    if (!nameMatch(spec.metadata.name, selector.name)) {
        return undefined;
    }
    if (!nameMatch(spec.metadata.namespace, selector.namespace)) {
        return undefined;
    }
    if (!labelMatch(spec, selector.labelSelector)) {
        return undefined;
    }
    if (!kindMatch(spec, selector.kinds)) {
        return undefined;
    }
    if (!filterMatch(spec, selector.filter)) {
        return undefined;
    }
    return selector.action;
}

/**
 * Determine if Kubernetes resource `kind` property is among the kinds
 * provided.  If no kinds are provided, it is considered matching.
 * Only the resource's `kind` property is considered when matching,
 * `apiVersion` is ignored.
 *
 * @param spec Kubernetes resource to check
 * @param kinds Kubernetes resource selector `kinds` property to use for checking
 * @return Return `true` if it is a match, `false` otherwise
 */
export function kindMatch(spec: K8sObject, kinds: KubernetesResourceKind[]): boolean {
    if (!kinds || kinds.length < 1) {
        return true;
    }
    return kinds.map(ak => ak.kind).includes(spec.kind);
}

/**
 * Determine if Kubernetes resource `kind` property is among the kinds
 * provided.  If no kinds are provided, it is considered matching.
 * Only the resource's `kind` property is considered when matching,
 * `apiVersion` is ignored.
 *
 * @param spec Kubernetes resource to check
 * @param kinds Kubernetes resource selector `kinds` property to use for checking
 * @return Return `true` if it is a match, `false` otherwise
 */
export function filterMatch(spec: K8sObject, filter: (r: K8sObject) => boolean): boolean {
    if (!filter) {
        return true;
    }
    return filter(spec);
}
