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

import { KubernetesResourceRequest } from "./request";

/**
 * Remove objectionable characters from a Kubernetes label value.
 * The validation regular expression for a label value is
 * /^(([A-Za-z0-9][-A-Za-z0-9_.]*)?[A-Za-z0-9])?$/.
 *
 * @param value The label value
 * @return A valid label value based on the input
 */
export function safeLabelValue(value: string): string {
    return value.replace(/^[^A-Za-z0-9]+/, "")
        .replace(/[^A-Za-z0-9]+$/, "")
        .replace(/[^-A-Za-z0-9_.]+/g, "_");
}

/** Input type for matchLabels function. */
export type MatchLabelInput = Pick<KubernetesResourceRequest, "name" | "workspaceId">;

/**
 * Returns the subset of the default set of labels for that should be
 * used in a matchLabels to match a resource.
 */
export function matchLabels(req: MatchLabelInput): { [key: string]: string } {
    return {
        "app.kubernetes.io/name": req.name,
        "atomist.com/workspaceId": req.workspaceId,
    };
}

export type KubernetesApplicationLabelInput = Pick<KubernetesResourceRequest, "name" | "sdmFulfiller" | "workspaceId">;

/**
 * Support for the Kubernetes recommended set of labels,
 * https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
 */
export interface KubernetesLabelInput {
    /** The component within the application architecture. */
    component?: string;
    /** A unique name identifying the instance of an application */
    instance?: string;
    /** Version of this application. */
    version?: string;
}

/** Input type for the labels function. */
export type ApplicationLabelInput = KubernetesApplicationLabelInput & KubernetesLabelInput;

/**
 * Create a default set of labels for a resource.  The returned set
 * satisfy the recommendations from
 * https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
 */
export function applicationLabels(req: ApplicationLabelInput): { [key: string]: string } {
    const matchers = matchLabels(req);
    const labels: { [key: string]: string } = {
        ...matchers,
        "app.kubernetes.io/part-of": req.name,
        "app.kubernetes.io/managed-by": safeLabelValue(req.sdmFulfiller),
    };
    if (req.component) {
        labels["app.kubernetes.io/component"] = req.component;
    }
    if (req.instance) {
        labels["app.kubernetes.io/instance"] = req.instance;
    }
    if (req.version) {
        labels["app.kubernetes.io/version"] = req.version;
    }
    return labels;
}
