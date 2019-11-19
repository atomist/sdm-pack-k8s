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
    logger,
} from "@atomist/automation-client";
import { execPromise, ExecPromiseResult } from "@atomist/sdm";
import { SpawnSyncOptions } from "child_process";
import * as _ from "lodash";
import { KubernetesSyncOptions } from "../config";
import { K8sObject } from "../kubernetes/api";
import { applySpec } from "../kubernetes/apply";
import { deleteSpec } from "../kubernetes/delete";
import { decryptSecret } from "../kubernetes/secret";
import { parseKubernetesSpecs } from "../kubernetes/spec";
import { sameObject } from "./application";
import { PushDiff } from "./diff";

/**
 * Decorator to facilitate testing
 */
export type Execer = (cmd: string, args: string[], opts: SpawnSyncOptions) => Promise<ExecPromiseResult>;

/**
 * Delete/apply resources in change.  The spec file provided by the
 * change.path may contain multiple specs.  The requested change is
 * applied to each.
 */
export async function changeResource(p: GitProject, change: PushDiff, exec: Execer = execPromise): Promise<void> {
    const beforeContents = await previousSpecVersion(p.baseDir, change.path, change.sha, exec);
    const beforeSpecs = parseKubernetesSpecs(beforeContents);
    let specs: K8sObject[];
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
        const changer = (specChange.change === "delete") ? deleteSpec : applySpec;
        _.set(specChange.spec, "metadata.annotations['atomist.com/sync-sha']", change.sha);

        if (specChange.change !== "delete" && specChange.spec.kind === "Secret" && syncOpts.secretKey) {
            specChange.spec = await decryptSecret(specChange.spec, syncOpts.secretKey);
        }
        await changer(specChange.spec);
    }
}

/**
 * Use the Git CLI to fetch the previous version of the spec.
 *
 * @param baseDir Project repository base directory
 * @param specPath Path to spec file relative to `baseDir`
 */
export async function previousSpecVersion(baseDir: string, specPath: string, sha: string, exec: Execer): Promise<string> {
    try {
        const showResult = await exec("git", ["show", `${sha}~1:${specPath}`], { cwd: baseDir });
        return showResult.stdout;
    } catch (e) {
        logger.debug(`Failed to git show '${specPath}' from ${sha.substring(0, 7)}~1, returning empty string: ${e.message}`);
        return "";
    }
}

/** Return type from [[calculateChanges]]. */
export interface SyncChanges {
    /** "apply" or "delete" */
    change: "apply" | "delete";
    /** Spec to apply/delete. */
    spec: K8sObject;
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
export function calculateChanges(before: K8sObject[], after: K8sObject[] | undefined, change: "apply" | "delete"): SyncChanges[] {
    if (change === "delete") {
        return (before || []).map(spec => ({ change, spec }));
    }
    const changes: SyncChanges[] = (after || []).map(spec => ({ change, spec }));
    if (before && before.length > 0) {
        for (const spec of before) {
            if (!after.some(a => sameObject(a, spec))) {
                changes.push({ change: "delete", spec });
            }
        }
    }
    return changes;
}
