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

export type MaybePromise<T> = T | Promise<T>;

////////////////////////////////////////////////////////////////////////////////
// Errors

export const errorCodeMap = {
  IDEMPOTENCY_KEY_REQUIRED: "The Idempotency-Key header is required.",
  DUPLICATE_REQUEST: "This is a duplicate request.",
  IDEMPOTENT_REQUEST_FAILED:
    "The previous attempt for this request has failed and cannot be retried.",
  IDEMPOTENCY_KEY_MISMATCH: "The Idempotency-Key does not match the request.",
  EMAIL_ALREADY_EXISTS: "This email is already in use.",
  TEMPORARY_UNAVAILABLE:
    "Service is temporarily unavailable. Please retry later.",
  INTERNAL_SERVER_ERROR: "An unexpected error occurred.",
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
////////////////////////////////////////////////////////////////////////////////
// Result

type Result<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: unknown;
    };

export async function resultify<T>(
  fn: () => MaybePromise<T>
): Promise<Result<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}

export function resultifySync<T>(fn: () => T): Result<T> {
  try {
    const data = fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}
