import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const aes256GcmKeyBuffer = parseAes256GcmKey();

function parseAes256GcmKey() {
  const aes256GcmKey = process.env.AES_256_GCM_KEY;
  if (!aes256GcmKey) {
    throw new Error("Please set AES_256_GCM_KEY env var.");
  }

  if (aes256GcmKey.length !== 64) {
    throw new Error("Invalid AES_256_GCM_KEY length.");
  }

  const aes256GcmKeyBuffer = Buffer.from(aes256GcmKey, "hex");
  return aes256GcmKeyBuffer;
}

export function encryptAes256Gcm(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aes256GcmKeyBuffer, iv);

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, authTag, encrypted]);
  return payload.toString("base64");
}

export function decryptAes256Gcm(base64Payload: string): string {
  const payload = Buffer.from(base64Payload, "base64");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", aes256GcmKeyBuffer, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
