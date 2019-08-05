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

import { StartupListener } from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import * as cluster from "cluster";
import * as _ from "lodash";
import { queryForScmProvider } from "./repo";
import { repoSync } from "./sync";

/**
 * If the SDM is registered with one or more workspaces and not
 * running in local mode, query cortex for the sync repo and replace
 * the sdm.k8s.options.sync.repo property with a RemoteRepoRef for
 * that repo.  If this is the cluster master, run [[repoSync]].  If
 * this is the cluster master and the SDM configuration has a
 * [[KubernetesSyncOptions]] with a positive value of
 * `intervalMinutes`, it will set up an interval timer to apply the
 * specs from the sync repo periodically.
 */
export const syncRepoStartupListener: StartupListener = async ctx => {
    if (isInLocalMode()) {
        return;
    }
    const sdm = ctx.sdm;
    if (!await queryForScmProvider(sdm)) {
        return;
    }
    if (!cluster.isMaster) {
        return;
    }
    await repoSync(sdm);
    const interval: number = _.get(sdm, "configuration.sdm.k8s.options.sync.intervalMinutes");
    if (interval && interval > 0) {
        setInterval(() => repoSync(sdm), interval * 60 * 1000);
    }
    return;
};
