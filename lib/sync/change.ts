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
    GitProject,
    logger,
} from "@atomist/automation-client";
import { execPromise } from "@atomist/sdm";
import * as k8s from "@kubernetes/client-node";
import * as _ from "lodash";
import { applySpec } from "../kubernetes/apply";
import { deleteSpec } from "../kubernetes/delete";
import { PushDiff } from "./diff";

/**
 * Delete/apply resource spec change.
 */
export async function changeResource(p: GitProject, change: PushDiff): Promise<void> {
    let specContents: string;
    if (change.change === "delete") {
        try {
            const showResult = await execPromise("git", ["show", `${change.sha}~1:${change.path}`], { cwd: p.baseDir });
            specContents = showResult.stdout;
        } catch (e) {
            e.message = `Failed to git show '${change.path}' from ${change.sha}~1: ${e.message}`;
            logger.error(e.message);
            throw e;
        }
    } else {
        const specFile = await p.getFile(change.path);
        if (!specFile) {
            throw new Error(`Resource spec file '${change.path}' does not exist in project`);
        }
        specContents = await specFile.getContent();
    }
    let spec: k8s.KubernetesObject;
    try {
        spec = JSON.parse(specContents);
        _.set(spec, "metadata.annotations['atomist.com/sync-sha']", change.sha);
    } catch (e) {
        e.message = `Failed to parse spec '${specContents}' as JSON: ${e.message}`;
        logger.error(e.message);
        throw e;
    }
    const changer = (change.change === "delete") ? deleteSpec : applySpec;
    await changer(spec);
}
