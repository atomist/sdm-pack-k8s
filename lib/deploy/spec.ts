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
    Project,
} from "@atomist/automation-client";
import * as yaml from "js-yaml";
import * as path from "path";

/**
 * Read and parse either JSON or YAML file with basename `base` under
 * `.atomist/kubernetes` in project.  This function looks for
 * `base`.json, `base`.yaml, and then `base`.yml.  If it successfully
 * reads and parses one of them into a truthy value, it returns its
 * parsed value.  If there are mulitple files matching those it looks
 * for, it does _not_ overlay/merge the parsed values.  It stops after
 * the first successfully parsed file.
 */
export async function loadKubernetesSpec(p: Project, base: string): Promise<any | undefined> {
    for (const ext of ["json", "yaml", "yml"]) {
        const specFile = `${base}.${ext}`;
        const spec = await parseKubernetesSpec(p, specFile);
        if (spec) {
            return spec;
        }
    }
    return undefined;
}

/**
 * Reads and parses Kubernetes JSON or YAML spec from the project's
 * .atomist/kubernetes folder.  It swallows all exceptions, returning
 * undefined if one occurs.
 *
 * If the `name` of the file ends with `.yaml` or `.yml`, the file
 * contents are parsed as YAML.  Otherwise it is parsed as JSON.
 *
 * You probably do not want to call this directly, use
 * [[loadKubernetesSpec]] instead.
 *
 * @param p Project to look for spec file in
 * @param name File name of spec under .atomist/kubernetes
 * @returns the parsed object if the spec was successfully read and parsed, undefined otherwise
 */
export async function parseKubernetesSpec(p: Project, name: string): Promise<any | undefined> {
    const specPath = path.join(".atomist", "kubernetes", name);
    try {
        const specFile = await p.getFile(specPath);
        if (!specFile) {
            return undefined;
        }
        const specString = await specFile.getContent();
        let spec: any;
        if (/\.ya?ml$/.test(name)) {
            spec = yaml.safeLoad(specString);
        } else {
            spec = JSON.parse(specString);
        }
        return spec;
    } catch (e) {
        logger.warn(`Failed to read and parse spec file ${specPath}: ${e.message}`);
    }
    return undefined;
}
