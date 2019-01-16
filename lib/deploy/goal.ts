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

import { GitProject } from "@atomist/automation-client";
import {
    AnyPush,
    DefaultGoalNameGenerator,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    FulfillmentRegistration,
    getGoalDefinitionFrom,
    Goal,
    SdmGoalEvent,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { KubernetesApplication } from "../kubernetes/request";
import { kubernetesApplicationCallback } from "./callback";
import { getEnvironmentLabel } from "./environment";
// import { executeKubernetesDeployment } from "./execute";

/** Return repository slug for SDM goal event. */
export function goalEventSlug(goalEvent: SdmGoalEvent): string {
    return `${goalEvent.repo.owner}/${goalEvent.repo.name}`;
}

/**
 * Function signature for callback that can modify and return the
 * KubernetesApplication object.
 */
export type ApplicationDataCallback =
    (p: GitProject, a: KubernetesApplication, g: KubernetesDeployV2, e: SdmGoalEvent) => Promise<KubernetesApplication>;

/**
 * Registration object to pass to KubernetesDeployment goal to
 * configure how deployment works.
 */
export interface KubernetesDeployV2Registration extends FulfillmentRegistration {
    /**
     * Allows the user of this pack to modify the default application
     * data before execution of deployment.
     */
    applicationData?: ApplicationDataCallback;
    /**
     * It not set (falsey), this SDM will fulfill its own Kubernetes
     * deployment goals using [[executeKubernetesDeployment]].  If
     * set, its value defines the name of the side-effect that will
     * fulfill the goal.  In this case, there should be another SDM
     * running whose name, i.e., its name as defined in its
     * package.json, is the same as the value of fulfillment and who
     * is configured to manage deploying resources to the requested
     * goal's namespace, i.e., [[KubernetesApplication.ns]].
     */
    fulfillment?: string;
    /**
     * The namespaces to manage application deployments in.  If it is
     * `undefined`, deployments to all namespaces are managed by this
     * SDM.  If set to an empty array, this SDM will only schedule
     * deployment goals, not fulfill them.
     */
    namespaces?: string[];
}

function defaultDetails(details: FulfillableGoalDetails = {}): FulfillableGoalDetails {
    const envLabel = getEnvironmentLabel(details);
    if (!details.displayName) {
        details.displayName = `deploy${envLabel}`;
    }
    details.descriptions = details.descriptions || {};
    if (!details.descriptions.completed) {
        details.descriptions.completed = `Deployed${envLabel}`;
    }
    if (!details.descriptions.failed) {
        details.descriptions.failed = `Deployment${envLabel} failed`;
    }
    if (!details.descriptions.waitingForApproval) {
        details.descriptions.waitingForApproval = `Successfully deployed${envLabel}`;
    }
    return details;
}

/**
 * Goal that deploys an application to a Kubernetes cluster either
 * directly or requesting its fulfillment by a side effect.
 *
 * Note: the `details.environment` property is mapped to a
 * `GoalEnvironment` and that value becomes the goal environment.  So
 * the `goal.details.environment` and `goal.environment` may differ.
 * You can always access `details.environment` via the `details`
 * property.
 */
export class KubernetesDeployV2 extends FulfillableGoalWithRegistrations<KubernetesDeployV2Registration> {

    public readonly details: FulfillableGoalDetails;

    constructor(details?: FulfillableGoalDetails, ...dependsOn: Goal[]) {
        const deets = defaultDetails(details);
        super(getGoalDefinitionFrom(deets, DefaultGoalNameGenerator.generateName("kubernetes-deployment")),
            ...dependsOn);
        this.details = deets;
    }

    /**
     * Register a deployment with all required callbacks.
     */
    public with(registration: KubernetesDeployV2Registration): this {
        if (registration.fulfillment) {
            this.addFulfillment({
                name: registration.fulfillment,
                pushTest: registration.pushTest,
            });
        } else {
            this.addFulfillment({
                name: registration.name,
                // goalExecutor: executeKubernetesDeployment(this, registration),
                pushTest: registration.pushTest,
            });
        }

        this.addFulfillmentCallback({
            goal: this,
            callback: kubernetesApplicationCallback(this, registration),
        });

        return this;
    }

    /**
     * Called by the SDM on initialization
     */
    public register(sdm: SoftwareDeliveryMachine): void {
        super.register(sdm);

        // Register a startup listener to add the default deployment if no dedicated got registered
        sdm.addStartupListener(async () => {
            if (this.fulfillments.length === 0 && this.callbacks.length === 0) {
                // Register the default deployment
                this.with({ name: "default-" + this.name, pushTest: AnyPush });
            }
        });
    }
}
