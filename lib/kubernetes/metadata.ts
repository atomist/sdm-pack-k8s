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

import * as k8s from "@kubernetes/client-node";
import { DeepPartial } from "ts-essentials";

/**
 * Workaround for all properties erroneously being required in
 * TypeScript class definitions
 * https://github.com/kubernetes-client/javascript/issues/87 when in
 * reality everything is optional in the metadata, even, somehow, the
 * name.
 */
export function metadataTemplate(partial: DeepPartial<k8s.V1ObjectMeta> = {}): k8s.V1ObjectMeta {
    return partial as k8s.V1ObjectMeta;
}
