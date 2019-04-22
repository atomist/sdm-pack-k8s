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

import * as crypto from "crypto";
import { promisify } from "util";

/**
 * Encrypt a text string.
 */
export async function encrypt(text: string, key: string): Promise<string> {
    const derivedKey = await deriveKey(key);
    const iv = await deriveKey(derivedKey.toString("hex"), 16);
    const cipher = crypto.createCipheriv(algo, derivedKey, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return encrypted.toString("hex");
}

/**
 * Decrypt a text string.
 */
export async function decrypt(text: string, key: string): Promise<string> {
    const derivedKey = await deriveKey(key);
    const iv = await deriveKey(derivedKey.toString("hex"), 16);
    const decipher = crypto.createDecipheriv(algo, derivedKey, iv);
    const encryptedText = Buffer.from(text, "hex");
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

const algo = "aes-256-cbc";

async function deriveKey(key: string, length: number = 32): Promise<Buffer> {
    const pScrypt: (k: string, s: string, l: number) => Promise<Buffer> = promisify(crypto.scrypt);
    return pScrypt(key, key.substring(0, 16), length);
}
