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
import {
    AnyPush,
    DefaultGoalNameGenerator,
    ExecuteGoal,
    ExecuteGoalResult,
    FulfillableGoalDetails,
    FulfillableGoalWithRegistrations,
    getGoalDefinitionFrom,
    Goal,
    GoalInvocation,
    PushTest,
    SdmGoalEvent,
    SdmGoalState,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { isInLocalMode } from "@atomist/sdm-core";
import * as stringify from "json-stringify-safe";
import * as _ from "lodash";
import { KubernetesApplication } from "../kubernetes/request";
import { getClusterLabel } from "./cluster";
import { generateKubernetesGoalEventData } from "./data";
import { deployApplication } from "./deploy";

/** Return repository slug for SDM goal event. */
export function goalEventSlug(goalEvent: SdmGoalEvent): string {
    return `${goalEvent.repo.owner}/${goalEvent.repo.name}`;
}

/**
 * Function signature for callback that can modify and return the
 * [[KubernetesApplication]] object.
 */
export type ApplicationDataCallback =
    (a: KubernetesApplication, p: GitProject, g: KubernetesDeploy, e: SdmGoalEvent) => Promise<KubernetesApplication>;

/**
 * Registration object to pass to KubernetesDeployment goal to
 * configure how deployment works.
 */
export interface KubernetesDeployRegistration {
    /**
     * Allows the user of this pack to modify the default application
     * data before execution of deployment.
     */
    applicationData?: ApplicationDataCallback;
    /**
     * It not set (falsey), this SDM will fulfill its own Kubernetes
     * deployment goals.  If set, its value defines the name of the
     * SDM that will fulfill the goal.  In this case, there should be
     * another SDM running whose name, i.e., its name as defined in
     * its registration/package.json, is the same as this name.
     */
    name?: string;
    /**
     * Optional push test for this goal implementation.
     */
    pushTest?: PushTest;
}

/**
 * Goal that initiates deploying an application to a Kubernetes
 * cluster.  Deploying the application is completed by the
 * [[kubernetesDeployHandler]] event handler.  By default, this goal
 * will be configured such that it is fulfilled by the SDM that
 * creates it.  To have this goal be executed by another SDM, set the
 * fulfillment name to the name of that SDM:
 *
 *     const deploy = new KubernetesDeploy()
 *         .with({ name: otherSdm.configuration.name });
 *
 */
export class KubernetesDeploy extends FulfillableGoalWithRegistrations<KubernetesDeployRegistration> {

    /**
     * Create a KubernetesDeploy object.
     *
     * @param details Define unique aspects of this Kubernetes deployment, see [[KubernetesDeploy.details]].
     * @param dependsOn Other goals that must complete successfully before scheduling this goal.
     */
    constructor(public readonly details?: FulfillableGoalDetails, ...dependsOn: Goal[]) {
        super(getGoalDefinitionFrom(details, DefaultGoalNameGenerator.generateName("kubernetes-deploy")), ...dependsOn);
    }

    /**
     * Register a deployment with the initiator fulfillment.
     */
    public with(registration: KubernetesDeployRegistration): this {
        const fulfillment = registration.name || this.sdm.configuration.name;
        this.addFulfillment({
            name: fulfillment,
            goalExecutor: initiateKubernetesDeploy(this, registration),
            pushTest: registration.pushTest,
        });
        this.populateDefinition(fulfillment);

        return this;
    }

    /**
     * Called by the SDM on initialization.  This function calls
     * `super.register` and adds a startup listener to the SDM.
     *
     * The startup listener registers a default goal fulfillment that
     * adds itself as fulfiller of its deployment requests if this
     * goal has no fulfillments or callbacks at startup.
     */
    public register(sdm: SoftwareDeliveryMachine): void {
        super.register(sdm);

        sdm.addStartupListener(async () => {
            if (this.fulfillments.length === 0 && this.callbacks.length === 0) {
                this.with({ pushTest: AnyPush });
            }
        });
    }

    /**
     * Set the goal definition "displayName" property and populate the
     * various goal definition descriptions with reasonable defaults.
     * Other than "displayName", if any stage definition is already
     * populated, it is not changed.
     *
     * @param fulfillment Name of fulfillment, typically the cluster-scoped name of k8s-sdm
     */
    private populateDefinition(fulfillment: string): this {
        const env = (this.details && this.details.environment) ? this.details.environment : this.environment;
        const clusterLabel = getClusterLabel(env, fulfillment);
        this.definition.displayName = `deploy${clusterLabel}`;
        const defaultDefinitions = {
            canceledDescription: `Canceled ${this.definition.displayName}`,
            completedDescription: `Deployed${clusterLabel}`,
            failedDescription: `Deployment${clusterLabel} failed`,
            plannedDescription: `Planned ${this.definition.displayName}`,
            requestedDescription: `Requested ${this.definition.displayName}`,
            skippedDescription: `Skipped ${this.definition.displayName}`,
            stoppedDescription: `Stopped ${this.definition.displayName}`,
            waitingForApprovalDescription: `Successfully deployed${clusterLabel}`,
            waitingForPreApprovalDescription: `Deploy${clusterLabel} pending approval`,
            workingDescription: `Deploying${clusterLabel}`,
        };
        logger.debug(`populateDefinition:definition:${stringify(this.definition)}`);
        logger.debug(`populateDefinition:defaultDefinitions:${stringify(defaultDefinitions)}`);
        _.defaultsDeep(this.definition, defaultDefinitions);
        return this;
    }

}

/**
 * If in SDM team mode, this goal executor generates and stores the
 * Kubernetes application data for deploying an application to
 * Kubernetes.  It returns the augmented SdmGoalEvent with the
 * Kubernetes application information in the `data` property and the
 * state of the SdmGoalEvent set to "in_process".  The actual
 * deployment is done by the [[kubernetesDeployHandler]] event
 * handler.
 *
 * If in SDM local mode, generate the Kubernetes application data and
 * deploy the application.
 *
 * @param k8Deploy Kubernetes deploy object
 * @param registration Kubernetes deploy object registration
 * @return An ExecuteGoal result that is not really a result, but an intermediate state.
 */
export function initiateKubernetesDeploy(k8Deploy: KubernetesDeploy, registration: KubernetesDeployRegistration): ExecuteGoal {
    return async (goalInvocation: GoalInvocation): Promise<ExecuteGoalResult> => {
        const goalEvent = await generateKubernetesGoalEventData(k8Deploy, registration, goalInvocation);
        if (isInLocalMode()) {
            return deployApplication(goalEvent, goalInvocation.context, goalInvocation.progressLog);
        } else {
            goalEvent.state = SdmGoalState.in_process;
            return goalEvent;
        }
    };
}
