import {
    ExtensionPack,
    Goal,
    PushTest,
} from "@atomist/sdm";
import { RepoContext } from "@atomist/sdm/api/context/SdmContext";
import { SdmGoal } from "@atomist/sdm/ingesters/sdmGoalIngester";

// tslint:disable-next-line:no-var-requires
const pj = require("./package.json");

/**
 * Configuration options to be passed to the Extension Pack creation.
 * Deployments can be configured based on goals and push tests. Each
 * deployment can be configured using a callback to prepare the deployment
 * and service spec data needed to triggered customized deployments.
 */
export interface KubernetesOptions {
    deployments: Array<{
        goal: Goal;
        pushTest?: PushTest;
        callback?: (goal: SdmGoal, context: RepoContext) => Promise<SdmGoal>;
    }>;
}

/**
 * Register Kubernetes deployment support for provided goals.
 * @param {KubernetesOptions} options
 * @returns {ExtensionPack}
 */
export function kubernetesSupport(options: KubernetesOptions): ExtensionPack {
    return {
        name: pj.name,
        vendor: pj.author.name,
        version: pj.version,
        configure: sdm => {

            options.deployments.forEach(deployment => {
                sdm.goalFulfillmentMapper.addSideEffect({
                    goal: deployment.goal,
                    pushTest: deployment.pushTest,
                    sideEffectName: "@atomist/k8-automation",
                });

                if (deployment.callback) {
                    sdm.goalFulfillmentMapper.addFullfillmentCallback({
                        goal: deployment.goal,
                        callback: deployment.callback,
                    });
                }
            });

        },
    };
}
