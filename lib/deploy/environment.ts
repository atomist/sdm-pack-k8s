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
    FulfillableGoalDetails,
    ProductionEnvironment,
    StagingEnvironment,
} from "@atomist/sdm";

/**
 * Generate environment label for this Kubernetes deployment goal.  A
 * environment of type `string` is converted to a label of the form
 * "to `env`".  An environment of `StagingEnvironment` or
 * `ProductionEnvironment` is mapped to an appropriate string and
 * converted to a label of the form "to `string`".  If the environment
 * is not truthy or is a different `GoalEnvironment`, an empty string
 * is returned.
 */
export function getEnvironmentLabel(details: Pick<FulfillableGoalDetails, "environment">): string {
    if (details.environment) {
        // GoalEnvironments are strings, so check if string matches pattern
        if (/^\d+-\w+\/$/.test(details.environment)) {
            switch (details.environment) {
                case StagingEnvironment:
                    return " to `testing`";
                case ProductionEnvironment:
                    return " to `production`";
                default:
                    return "";
            }
        } else {
            return ` to \`${details.environment}\``;
        }
    } else {
        return "";
    }
}
