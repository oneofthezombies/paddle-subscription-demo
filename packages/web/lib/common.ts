import { z } from "zod";

export async function sha256Hex(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

export const SignUp = z.object({
  email: z
    .string()
    .min(1, { message: "Email is required." })
    .email({ message: "Invalid email address." }),
  password: z
    .string()
    .min(1, { message: "Password must be at least 1 characters." }),
});
export type SignUp = z.infer<typeof SignUp>;

export const errorCodeMap = {
  MISSING_IDEMPOTENCY_KEY: "Missing Idempotency-Key",
};
export type ErrorCode = keyof typeof errorCodeMap;

export function errorObject(code: ErrorCode) {
  return {
    error: {
      code,
      message: errorCodeMap[code],
    },
  };
}

export async function signUpIdempotencyKey(email: string) {
  return await sha256Hex(`signup:${email}`);
}
