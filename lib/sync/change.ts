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
    configurationValue,
    GitProject,
} from "@atomist/automation-client";
import * as k8s from "@kubernetes/client-node";
import * as _ from "lodash";
import { KubernetesSyncOptions } from "../config";
import { applySpec } from "../kubernetes/apply";
import { deleteSpec } from "../kubernetes/delete";
import { decryptSecret } from "../kubernetes/secret";
import { parseKubernetesSpecs } from "../kubernetes/spec";
import { sameObject } from "./application";
import { changeType } from "./changeType";
import { PushDiff } from "./diff";
import { previousSpecVersion } from "./previousSpecVersion";

/**
 * Delete/apply resources in change.  The spec file provided by the
 * change.path may contain multiple specs.  The requested change is
 * applied to each.
 */
export async function changeResource(p: GitProject, change: PushDiff): Promise<void> {
    const beforeContents = await previousSpecVersion(p.baseDir, change.path, change.sha);
    const beforeSpecs = parseKubernetesSpecs(beforeContents);
    let specs: k8s.KubernetesObject[];
    if (change.change !== "delete") {
        const specFile = await p.getFile(change.path);
        if (!specFile) {
            throw new Error(`Resource spec file '${change.path}' does not exist in project`);
        }
        const specContents = await specFile.getContent();
        specs = parseKubernetesSpecs(specContents);
    }
    const changes = calculateChanges(beforeSpecs, specs, change.change);
    const syncOpts = configurationValue<Partial<KubernetesSyncOptions>>("sdm.k8s.options.sync", {});

    for (const specChange of changes) {
        let changer;
        switch (specChange.change) {
            case "delete": {
                changer = deleteSpec;
                break;
            }
            case "ignore": {
                changer = async (spec: k8s.KubernetesObject) => (Promise.resolve);
                break;
            }
            default: {
                changer = applySpec;
            }
        }
        _.set(specChange.spec, "metadata.annotations['atomist.com/sync-sha']", change.sha);

        if (specChange.change !== "delete" && specChange.spec.kind === "Secret" && syncOpts.secretKey) {
            specChange.spec = await decryptSecret(specChange.spec, syncOpts.secretKey);
        }
        await changer(specChange.spec);
    }
}

/** Return type from [[calculateChanges]]. */
export interface SyncChanges {
    /** "apply", "delete" or "ignore" */
    change: changeType;
    /** Spec to apply/delete. */
    spec: k8s.KubernetesObject;
}

/**
 * Inspect before and after specs to determine actions.  If the action
 * is "delete", return delete actions for all specs in `before`.  If
 * the action is "apply", add apply actions for all specs in `after`
 * and delete actions for all specs in `before` that are not in
 * `after`.
 *
 * @param before The specs before the change
 * @param after The specs after the change
 * @param change The type of change
 * @return Array containing the type of change for each spec
 */
export function calculateChanges(
    before: k8s.KubernetesObject[],
    after: k8s.KubernetesObject[] | undefined,
    change: changeType,
): SyncChanges[] {

    const changes: SyncChanges[] = (after || []).filter(spec => !hasMetadataAnnotation(spec, "ignore")).map(spec => ({ change, spec }));
    if (before && before.length > 0) {
        for (const spec of before) {
            if (hasMetadataAnnotation(spec, "ignore")) {
                changes.push({ change: "ignore", spec });
            } else if ((change === "delete") || (!after.some(a => sameObject(a, spec)))) {
                changes.push({ change: "delete", spec });
            }
        }
    }

    return changes;
}

/**
 * Check if the Kubernetes Object has an annotation that is relevant to the current SDM
 * @param spec the spec to inspect
 * @param annotationValue to validate for
 * @returns the result of the annotation inspection
 */
function hasMetadataAnnotation(spec: k8s.KubernetesObject, annotationValue: string): boolean {
    return _.get(spec, `metadata.annotations['atomist.com/sdm-pack-k8s/${configurationValue<string>("name")}']`, false) === annotationValue;
}
