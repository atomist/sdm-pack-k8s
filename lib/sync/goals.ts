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
import {
    ExecuteGoal,
    ExecuteGoalResult,
    goals,
    GoalWithFulfillment,
    IndependentOfEnvironment,
    LogSuppressor,
    minimalClone,
    PushTest,
    pushTest,
    SoftwareDeliveryMachine,
    whenPushSatisfies,
} from "@atomist/sdm";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { SyncOptions } from "../config";
import { changeResource } from "./change";
import { diffPush } from "./diff";
import { queryForScmProvider } from "./repo";
import { commitTag } from "./tag";

export async function isSyncRepoCommit(sdm: SoftwareDeliveryMachine): Promise<PushTest | undefined> {
    const syncOptions: SyncOptions = _.get(sdm, "configuration.sdm.k8s.options.sync");
    if (!syncOptions || !syncOptions.repo) {
        logger.warn(`SDM configuration contains to sync repo`);
        return undefined;
    }
    if (!syncOptions.credentials) {
        const repoCreds = await queryForScmProvider(sdm);
        if (!repoCreds) {
            logger.warn(`Failed to find sync repo: ${stringify(syncOptions.repo)}`);
            return undefined;
        }
    }
    return pushTest("IsSyncRepoCommit", async p => {
        if (p.id.providerType === syncOptions.repo.providerType &&
            p.id.owner === syncOptions.repo.owner &&
            p.id.repo === syncOptions.repo.repo &&
            p.id.branch === syncOptions.repo.branch) {
            const tag = commitTag(sdm.configuration);
            return p.push.commits.some(c => !c.message.includes(tag));
        }
        return false;
    });
}

/**
 * Add goals for pushes on the sync repo.
 */
export async function syncGoals(sdm: SoftwareDeliveryMachine): Promise<SoftwareDeliveryMachine> {
    const syncRepoPushTest = await isSyncRepoCommit(sdm);
    if (!syncRepoPushTest) {
        logger.warn(`Unable to create push test for sync repo, will not repond to pushes`);
        return sdm;
    }
    const sync = new GoalWithFulfillment({
        uniqueName: "sync",
        environment: IndependentOfEnvironment,
        displayName: "sync",
        workingDescription: "Syncing",
        completedDescription: "Synced",
        failedDescription: "Sync failed",
        isolated: true,
    }).with({
        name: "K8sSyncRepo",
        goalExecutor: K8sSync,
        logInterpreter: LogSuppressor,
    });
    const syncGoalSet = goals("Sync Kubernetes Resources").plan(sync);
    sdm.addGoalContributions(whenPushSatisfies(syncRepoPushTest).setGoals(syncGoalSet));
    return sdm;
}

/**
 * Create resources of added specs, update resources of changed specs,
 * and remove resources of deleted specs.
 */
export const K8sSync: ExecuteGoal = async gi => {
    const push = gi.goalEvent.push;
    const log = gi.progressLog;
    const params = {
        cloneOptions: minimalClone(push),
        context: gi.context,
        credentials: gi.credentials,
        id: gi.id,
        log,
        readOnly: true,
    };
    const tag = commitTag(gi.configuration);
    return gi.configuration.sdm.projectLoader.doWithProject<ExecuteGoalResult>(params, async p => {
        const changes = await diffPush(p, push, tag, log);
        const errs: Error[] = [];
        for (const change of changes) {
            try {
                await changeResource(p, change);
            } catch (e) {
                e.message = `Failed to ${change.change} '${change.path}' resource for commit ${change.sha}: ${e.message}`;
                logger.error(e.message);
                log.write(e.message);
                errs.push(e);
            }
        }
        if (errs.length > 0) {
            return { code: errs.length, message: errs.map(e => e.message).join("; ") };
        }
        return { code: 0, message: `Changed ${changes.length} resources` };
    });
};
