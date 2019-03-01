import {HandlerResult, logger, Parameter, Parameters} from "@atomist/automation-client";
import {CommandHandlerRegistration, slackSuccessMessage} from "@atomist/sdm";
import {rollbackApplication} from "../kubernetes/application";
import {defaultNamespace} from "../kubernetes/namespace";

@Parameters()
export class KubernetesRollbackParameters {

    @Parameter({
        displayName: "Name",
        description: "name of resources to rollback",
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
        description: "namespace of resources to rollback",
        pattern: /^[a-z](?:[-a-z0-9]*[a-z0-9])?$/,
        validInput: "a valid Kubernetes resource name, beginning with a lowercase letter, ending with a lowercase" +
            "letter or number, and containing only lowercase letters, numbers, and dashes (-)",
        minLength: 1,
        maxLength: 63,
        required: true,
    })
    public ns: string = defaultNamespace;

}

/**
 * Rollback all resources related to a Kubernetes deployment.
 */
export const kubernetesRollback: CommandHandlerRegistration<KubernetesRollbackParameters> = {
    name: "kubernetesRollback",
    intent: "kube rollback",
    description: "rollback all resources related to an application from Kubernetes cluster",
    paramsMaker: KubernetesRollbackParameters,
    listener: async ci => {

        const slug = `${ci.parameters.ns}/${ci.parameters.name}`;
        const rollApp = {
            name: ci.parameters.name,
            ns: ci.parameters.ns,
            workspaceId: ci.context.workspaceId,
        };
        const result: HandlerResult = {
            code: 0,
            message: `Successfully rolled back ${slug} resources from Kubernetes`,
        };
        try {
            await rollbackApplication(rollApp);
            logger.info(result.message);
            try {
                await ci.context.messageClient.respond(slackSuccessMessage("Kubernetes Rollback", result.message));
            } catch (err) {
                const msg = `Failed to send response message: ${err.message}`;
                logger.error(msg);
                result.message = `${result.message} but ${msg}`;
            }
        } catch (e) {
            result.code++;
            result.message = `Failed to rollback all ${slug} resources from Kubernetes: ${e.message}`;
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
