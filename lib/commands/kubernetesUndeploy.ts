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
    HandlerResult,
    logger,
    Parameter,
    Parameters,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    slackSuccessMessage,
} from "@atomist/sdm";
import { deleteApplication } from "../kubernetes/application";
import { defaultNamespace } from "../kubernetes/namespace";
import { syncApplication } from "../sync/application";

@Parameters()
export class KubernetesUndeployParameters {

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

}

/**
 * Safely remove all resources related to an Kubernetes deployment.
 */
export const kubernetesUndeploy: CommandHandlerRegistration<KubernetesUndeployParameters> = {
    name: "KubernetesUndeploy",
    intent: "kube undeploy",
    description: "remove all resources related to an application from Kubernetes cluster",
    paramsMaker: KubernetesUndeployParameters,
    listener: async ci => {

        const slug = `${ci.parameters.ns}/${ci.parameters.name}`;
        const delApp = {
            name: ci.parameters.name,
            ns: ci.parameters.ns,
            workspaceId: ci.context.workspaceId,
        };
        const result: HandlerResult = {
            code: 0,
            message: `Successfully deleted ${slug} resources from Kubernetes`,
        };
        try {
            const deleted = await deleteApplication(delApp);
            logger.info(result.message);
            try {
                await syncApplication(delApp, deleted, "delete");
            } catch (err) {
                result.code++;
                const msg = `Failed to delete resource specs from sync repo: ${err.message}`;
                logger.error(msg);
                result.message = `${result.message} but ${msg}`;
            }
            try {
                await ci.context.messageClient.respond(slackSuccessMessage("Kubernetes Undeploy", result.message));
            } catch (err) {
                const msg = `Failed to send response message: ${err.message}`;
                logger.error(msg);
                result.message = `${result.message} but ${msg}`;
            }
        } catch (e) {
            result.code++;
            result.message = `Failed to delete all ${slug} resources from Kubernetes: ${e.message}`;
            logger.error(result.message);
            try {
                await ci.context.messageClient.respond(result.message);
            } catch (err) {
                result.code++;
                result.message = `${result.message}; Failed to send response message: ${err.message}`;
                logger.error(result.message);
            }
        }
        return result;
    },
};
