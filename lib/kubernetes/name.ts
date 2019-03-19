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

export const defaultValidName = "valid-name";

/**
 * Ensure the provided name is a valid Kubernetes resouce name.  The
 * validation regular expression for a resource is
 * /^[a-z]([-a-z0-9]*[a-z0-9])?$/ and it must be between 1 and 63
 * characters long.
 *
 * @param name The resource name
 * @return A valid resource name based on the input
 */
export function validName(name: string): string {
    const valid = name.slice(0, 63).toLocaleLowerCase()
        .replace(/^[^a-z]+/, "")
        .replace(/[^a-z0-9]+$/, "")
        .replace(/[^-a-z0-9]+/g, "-");
    return (valid) ? valid : defaultValidName;
}
