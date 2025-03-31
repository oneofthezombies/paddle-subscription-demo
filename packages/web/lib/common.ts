import { z } from "zod";

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
  IDEMPOTENCY_KEY_REQUIRED: "The Idempotency-Key header is required.",
  DUPLICATE_REQUEST: "This is a duplicate request.",
  IDEMPOTENT_REQUEST_FAILED:
    "The previous attempt for this request has failed and cannot be retried.",
  IDEMPOTENCY_KEY_MISMATCH: "The Idempotency-Key does not match the request.",
  EMAIL_ALREADY_EXISTS: "This email is already in use.",
  TEMPORARY_UNAVAILABLE:
    "Service is temporarily unavailable. Please retry later.",
};
export type ErrorCode = keyof typeof errorCodeMap;

export function error(code: ErrorCode) {
  return {
    error: {
      code,
      message: errorCodeMap[code],
    },
  };
}

export async function tryAsync<T>(
  fn: () => Promise<T> | T
): Promise<{ ok: true; data: T } | { ok: false; error: unknown }> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}

export function trySync<T>(
  fn: () => T
): { ok: true; data: T } | { ok: false; error: unknown } {
  try {
    const data = fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}
