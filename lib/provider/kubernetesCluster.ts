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
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import { StartupListener } from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import {
    CreateKubernetesClusterProvider,
    KubernetesClusterProvider,
} from "../typings/types";

/**
 * If the SDM is not running in local mode and registered with one or
 * more workspaces, ensure that this SDM is available as a
 * KubernetesClusterProvider in those workspaces.
 */
export const providerStartupListener: StartupListener = async context => {
    if (!isInLocalMode()) {
        return;
    }
    const sdm = context.sdm;
    if (!sdm || !sdm.configuration || !sdm.configuration.workspaceIds || sdm.configuration.workspaceIds.length < 1) {
        logger.info(`SDM configuration contains no workspace IDs, not creating KubernetesClusterProvider`);
    }
    const name = context.sdm.configuration.name;
    await Promise.all(sdm.configuration.workspaceIds.map(async workspaceId => {
        const graphClient = sdm.configuration.graphql.client.factory.create(workspaceId, sdm.configuration);
        logger.debug(`Checking for KubernetesClusterProvider ${name} in workspace ${workspaceId}`);
        const providers = await graphClient.query<KubernetesClusterProvider.Query, KubernetesClusterProvider.Variables>({
            name: "KubernetesClusterProvider",
            variables: { name },
            options: QueryNoCacheOptions,
        });
        if (providers && providers.KubernetesClusterProvider && providers.KubernetesClusterProvider.length === 1) {
            logger.info(`KubernetesClusterProvider ${name} already exists in ${workspaceId}`);
            return;
        }
        if (providers && providers.KubernetesClusterProvider && providers.KubernetesClusterProvider.length > 1) {
            logger.warn(`More than one KubernetesClusterProvider with the name ${name} exists in ${workspaceId}`);
            return;
        }
        logger.info(`Creating KubernetesClusterProivder ${name} in ${workspaceId}`);
        await graphClient.mutate<CreateKubernetesClusterProvider.Mutation, CreateKubernetesClusterProvider.Variables>({
            name: "CreateKubernetesClusterProvider",
            variables: { name },
        });
        return;
    }));
    return;
};
