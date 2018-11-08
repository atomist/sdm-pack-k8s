/*
 * Copyright © 2018 Atomist, Inc.
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
    Failure,
    logger,
    Parameter,
    Parameters,
    Success,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    slackSuccessMessage,
} from "@atomist/sdm";
import * as k8 from "kubernetes-client";
import {
    deleteApplication,
    getKubeConfig,
    KubeDeleteRequest,
} from "../support/api";
import {
    defaultNamespace,
} from "../typings/kubernetes";

@Parameters()
export class KubeUndeployParameters {

    @Parameter({
        displayName: "Name",
        description: "name of resources to remove",
        pattern: /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/,
        validInput: "a valid Kubernetes resource name, beginning with a lowercase letter, ending with a lowercase" +
            "letter or number, and containing only lowercase letters, numbers, and dashes (-)",
        minLength: 1,
        maxLength: 63,
        required: true,
    })
    public name: string;

    @Parameter({
        displayName: "Namespace",
        description: "namespace of resources to remove",
        pattern: /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/,
        validInput: "a valid Kubernetes namespace, beginning with a lowercase letter, ending with a lowercase" +
            "letter or number, and containing only lowercase letters, numbers, and dashes (-)",
        minLength: 1,
        maxLength: 63,
        required: false,
    })
    public ns: string = defaultNamespace;

    @Parameter({
        displayName: "Port",
        description: "port the application listens on, if not provided no service resources are removed",
        pattern: /^\d{1,5}$/,
        validInput: "a number between 1 and 65535, inclusive",
        minLength: 1,
        maxLength: 5,
        required: false,
    })
    public port: string;

    @Parameter({
        displayName: "Path",
        description: "ingress path for the resource to remove, if not provided no service or ingress " +
            "resources are removed",
        pattern: /^\/\S+$/,
        validInput: "an asbolute URL path, unique for this Kubernetes cluster",
        minLength: 1,
        maxLength: 512,
        required: false,
    })
    public path: string;

    @Parameter({
        displayName: "Host",
        description: "ingress hostname for the resources to remove, if not provided the rule without a host " +
            "is modified",
        pattern: /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:\.[a-z0-9](?:[-a-z0-9]*[a-z0-9])?)*$/,
        validInput: "a valid hostname, each label beginning and ending with a lowercase letter or number and " +
            "containing only lowercase letters, numbers, and dashes (-), separated by periods (.)",
        minLength: 1,
        maxLength: 253,
        required: false,
    })
    public host: string;

}

/**
 * Safely remove all resources related to an Kubernetes deployment.
 */
export const kubeUndeploy: CommandHandlerRegistration<KubeUndeployParameters> = {
    name: "KubeUndeploy",
    intent: "kube undeploy",
    description: "remove all resources related to an application from Kubernetes cluster",
    paramsMaker: KubeUndeployParameters,
    listener: async ci => {

        let k8Config: k8.ClusterConfiguration | k8.ClientConfiguration;
        try {
            k8Config = getKubeConfig();
        } catch (e) {
            return ci.context.messageClient.respond(e.message)
                .then(() => ({ code: Failure.code, message: e.message }), err => {
                    const msg = `Failed to send response message: ${err.message}`;
                    return { code: Failure.code, message: `${e.message}; ${msg}` };
                });
        }

        const req: KubeDeleteRequest = {
            config: k8Config,
            name: ci.parameters.name,
            ns: ci.parameters.ns,
            path: ci.parameters.path,
            host: ci.parameters.host,
        };
        return deleteApplication(req)
            .then(() => {
                const message = `Successfully removed ${req.ns}/${req.name} resources from Kubernetes`;
                logger.info(message);
                return ci.context.messageClient.respond(slackSuccessMessage("Kubernetes Undeploy", message))
                    .then(() => Success, err => {
                        const msg = `Failed to send response message: ${err.message}`;
                        logger.error(msg);
                        return { code: Success.code, message: `${message} but ${msg}` };
                    });
            }, e => {
                const message = `Failed to remove ${req.ns}/${req.name} resources from Kubernetes: ${e.message}`;
                logger.error(message);
                return ci.context.messageClient.respond(message)
                    .then(() => ({ code: Failure.code, message }), err => {
                        logger.error(`Failed to send response message: ${err.message}`);
                        return { code: Failure.code, message: `${message}; ${err.message}` };
                    });
            });
    },
};
