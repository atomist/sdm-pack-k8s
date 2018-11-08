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

/**
 * Due to the incomplete typings for the JavaScript kubernetes-client
 * library, we provide these for the types we are using.  These are
 * more or less directly translated from the Kubernetes Go source
 * code.
 */

export interface Metadata {
    name: string;
    generateName?: string;
    namespace?: string;
    selfLink?: string;
    uid?: string;
    resourceVersion?: string;
    generation?: number;
    creationTimestamp?: string;
    deletionTimestamp?: string;
    deletionGracePeriodSeconds?: number;
    labels?: {
        [key: string]: string;
    };
    annotations?: {
        [key: string]: string;
    };
    clusterName?: string;
}

export interface Namespace {
    apiVersion: "v1";
    kind: "Namespace";
    metadata: Metadata;
}

export const defaultNamespace = "default";

export interface MatchSelector {
    matchLabels?: {
        [key: string]: string;
    };
    matchExpressions?: string[];
}

export interface Selector {
    [key: string]: string;
}

export interface HttpHeader {
    name: string;
    value: string;
}

export type UriScheme = "HTTP" | "HTTPS";

export interface Probe {
    httpGet?: {
        path?: string;
        port?: string;
        host?: string;
        scheme?: UriScheme;
        httpHeaders?: HttpHeader[];
    };
    initialDelaySeconds?: number;
    timeoutSeconds?: number;
    periodSeconds?: number;
    successThreshold?: number;
    failureThreshold?: number;
}

export type Protocol = "TCP" | "UDP";

export interface ContainerPort {
    name?: string;
    hostPort?: number;
    containerPort: number;
    protocol?: Protocol;
    hostIP?: string;
}

export interface ObjectFieldSelector {
    apiVersion?: string;
    fieldPath: string;
}

export interface ResourceFieldSelector {
    containerName?: string;
    resource: string;
    divisor?: string;
}

export interface ConfigMapKeySelector {
    name?: string;
    key: string;
    optional: boolean;
}

export interface SecretKeySelector {
    name?: string;
    key: string;
    optional?: boolean;
}

export interface EnvVarSource {
    fieldRef?: ObjectFieldSelector;
    resourceFieldRef?: ResourceFieldSelector;
    configMapKeyRef?: ConfigMapKeySelector;
    secretKeyRef?: SecretKeySelector;
}

export interface EnvVar {
    name: string;
    value?: string;
    valueFrom?: EnvVarSource;
}

export interface Resource {
    cpu?: string | number;
    memory?: string | number;
}

export interface ResourceRequirements {
    limits?: Resource;
    requests?: Resource;
}

export interface VolumeMount {
    name: string;
    readOnly?: boolean;
    mountPath: string;
    subPath?: string;
}

export interface VolumeDevice {
    name: string;
    devicePath: string;
}

export type PullPolicy = "Always" | "IfNotPresent" | "Never";

export type TerminationMessagePolicy = "File" | "FallbackToLogsOnError";

export interface Container {
    name: string;
    image?: string;
    command?: string[];
    args?: string[];
    workingDir?: string;
    ports?: ContainerPort[];
    env?: EnvVar[];
    resources?: ResourceRequirements;
    volumeMounts?: VolumeMount[];
    volumeDevices?: VolumeDevice[];
    livenessProbe?: Probe;
    readinessProbe?: Probe;
    terminationMessagePath?: string;
    terminationMessagePolicy?: TerminationMessagePolicy;
    imagePullPolicy?: PullPolicy;
    // securityContext?: SecurityContext;
    stdin?: boolean;
    stdinOnce?: boolean;
    tty?: boolean;
}

export type RestartPolicy = "Always" | "OnFailure" | "Never";

export type DNSPolicy = "ClusterFirstWithHostNet" | "ClusterFirst" | "Default" | "None";

export interface LocalObjectReference {
    name?: string;
}

export interface PodSpec {
    initContainers?: Container[];
    containers: Container[];
    restartPolicy?: RestartPolicy;
    terminationGracePeriodSeconds?: number;
    activeDeadlineSeconds?: number;
    dnsPolicy?: DNSPolicy;
    nodeSelector?: { [key: string]: string };
    serviceAccountName?: string;
    automountServiceAccountToken?: boolean;
    imagePullSecrets?: LocalObjectReference[];
}

export interface PodTemplate {
    metadata?: Metadata;
    spec?: PodSpec;
}

export interface Deployment {
    apiVersion: "extensions/v1beta1";
    kind: "Deployment";
    metadata?: Metadata;
    spec?: {
        replicas?: number;
        revisionHistoryLimit?: number;
        selector?: MatchSelector;
        template: PodTemplate;
        strategy?: {
            type: "Recreate" | "RollingUpdate";
            rollingUpdate?: {
                maxUnavailable?: number;
                maxSurge?: number;
            };
        };
    };
}

export interface ServicePort {
    name?: string;
    protocol?: Protocol;
    port: number;
    targetPort?: number | string;
    nodePort?: number;
}

export interface SessionAffinityConfig {
    clientIP?: {
        timeoutSeconds?: number;
    };
}

export interface ServiceSpec {
    ports: ServicePort[];
    selector?: Selector;
    clusterIP?: string;
    type?: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName";
    externalIPs?: string[];
    sessionAffinity?: "ClientIP" | "None";
    loadBalancerIP?: string;
    loadBalancerSourceRanges?: string[];
    externalName?: string;
    externalTrafficPolicy?: "Local" | "Cluster";
    healthCheckNodePort?: number;
    publishNotReadyAddresses?: boolean;
    sessionAffinityConfig?: SessionAffinityConfig;
}

export interface LoadBalancerIngress {
    ip?: string;
    hostname?: string;
}

export interface LoadBalancerStatus {
    ingress?: LoadBalancerIngress[];
}

export interface ServiceStatus {
    loadBalancer?: LoadBalancerStatus;
}

export interface Service {
    kind: "Service";
    apiVersion: "v1";
    metadata?: Metadata;
    spec?: ServiceSpec;
    status?: ServiceStatus;
}

export interface ObjectReference {
    kind?: string;
    namespace?: string;
    name?: string;
    uid?: string;
    apiVersion?: string;
    resourceVersion?: string;
    fieldPath?: string;
}

export interface EndpointAddress {
    ip: string;
    hostname?: string;
    nodeName?: string;
    targetRef?: ObjectReference;
}

export interface EndpointPort {
    name?: string;
    port: number;
    protocol?: Protocol;
}

export interface EndpointSubset {
    addresses?: EndpointAddress[];
    notReadyAddresses?: EndpointAddress[];
    ports?: EndpointPort[];
}

export interface Endpoints {
    kind: "Endpoints";
    apiVersion: "v1";
    metadata?: Metadata;
    subsets: EndpointSubset[];
}

export interface IngressBackend {
    serviceName: string;
    servicePort: string | number;
}

export interface IngressTLS {
    hosts?: string[];
    secretName?: string;
}

export interface HTTPIngressPath {
    path?: string;
    backend: IngressBackend;
}

export interface HTTPIngressRuleValue {
    paths: HTTPIngressPath[];
}

export interface IngressRule {
    host?: string;
    http?: HTTPIngressRuleValue;
}

export interface IngressSpec {
    backend?: IngressBackend;
    tls?: IngressTLS[];
    rules?: IngressRule[];
}

export interface IngressStatus {
    loadBalancer?: LoadBalancerStatus;
}

export interface Ingress {
    kind: "Ingress";
    apiVersion: "extensions/v1beta1";
    metadata?: Metadata;
    spec?: IngressSpec;
    status?: IngressStatus;
}
