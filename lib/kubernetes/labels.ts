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

import { logger } from "@atomist/automation-client";
import * as readPkgUp from "read-pkg-up";
import { KubernetesApplication } from "./request";

/**
 * Read name of this package from its package.json.
 */
export async function getCreator(): Promise<string> {
    try {
        const mePkgInfo = await readPkgUp({ cwd: __dirname });
        if (mePkgInfo && mePkgInfo.pkg && mePkgInfo.pkg.name) {
            const v = (mePkgInfo.pkg.version) ? `:${mePkgInfo.pkg.version}` : "";
            return mePkgInfo.pkg.name + v;
        }
        logger.warn(`Failed to read SDM package.json, returning default`);
    } catch (e) {
        logger.warn(`Failed to read SDM package.json, returning default: ${e.message}`);
    }
    return "sdm-pack-k8";
}

/** Input type for matchLabels function. */
export type MatchLabelInput = Pick<KubernetesApplication, "name" | "workspaceId">;

/**
 * Return type for the matchLabels function.  This is not used since
 * the @kubernetes/client-node wants `{ [key: string]: string }` as
 * its labels.
 */
export interface MatchLabelOutput {
    "app.kubernetes.io/name": string;
    "atomist.com/workspaceId": string;
}

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

export type KubernetesApplicationLabelInput = Pick<KubernetesApplication, "name" | "workspaceId" | "environment">;

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
 * Additional properties for the labels function output.  This is not
 * used since the @kubernetes/client-node wants `{ [key: string]:
 * string }` as its labels.
 */
export interface ApplicationLabelPartialOutput {
    "app.kubernetes.io/part-of": string;
    "app.kubernetes.io/managed-by": string;
    "atomist.com/environment": string;
    "app.kubernetes.io/component"?: string;
    "app.kubernetes.io/instance"?: string;
    "app.kubernetes.io/version"?: string;
}

/**
 * Return type for the labels function.  This is not used since the
 * @kubernetes/client-node wants `{ [key: string]: string }` as its
 * labels.
 */
export type ApplicationLabelOutput = MatchLabelOutput & ApplicationLabelPartialOutput;

/**
 * Create a default set of labels for a resource.  The returned set
 * satisfy the recommendations from
 * https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
 */
export async function applicationLabels(req: ApplicationLabelInput): Promise<{ [key: string]: string }> {
    const creator = await getCreator();
    const matchers = matchLabels(req);
    const labels: { [key: string]: string } = {
        ...matchers,
        "app.kubernetes.io/part-of": req.name,
        "app.kubernetes.io/managed-by": creator,
        "atomist.com/environment": req.environment,
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
