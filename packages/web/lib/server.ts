import { createCipheriv, randomBytes, createDecipheriv } from "crypto";
import { sha256Hex } from "./common";

const emailEncryptionKey = process.env.EMAIL_ENCRYPTION_KEY;
if (!emailEncryptionKey) {
  throw new Error("Please set EMAIL_ENCRYPTION_KEY env var.");
}

if (emailEncryptionKey.length !== 64) {
  throw new Error("Invalid EMAIL_ENCRYPTION_KEY length.");
}

const emailEncryptionKeyBuf = Buffer.from(emailEncryptionKey, "hex");
const emailEncryptionAlgorithm = "aes-256-gcm";

export function encryptEmail(text: string): string {
  const IV_LENGTH = 12;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(
    emailEncryptionAlgorithm,
    emailEncryptionKeyBuf,
    iv
  );

  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, authTag, encrypted]);
  return payload.toString("base64");
}

export function decryptEmail(base64Payload: string): string {
  const payload = Buffer.from(base64Payload, "base64");

  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);

  const decipher = createDecipheriv(
    emailEncryptionAlgorithm,
    emailEncryptionKeyBuf,
    iv
  );
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export async function hashEmail(email: string) {
  return await sha256Hex(`email:${email}`);
}
