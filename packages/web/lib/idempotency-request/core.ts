import {
  idempotencyRequestsTable,
  IdempotencyRequestStatus,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { z } from "zod";

export type MaybePromise<T> = T | Promise<T>;

export type encrypt = (text: string) => MaybePromise<string>;
export type decrypt = (base64Payload: string) => MaybePromise<string>;

const errorCodeMap = {
  IDEMPOTENCY_KEY_REQUIRED:
    "The 'Idempotency-Key' header is required for this request.",
  EXTERNAL_REQUEST_IN_PROGRESS:
    "The request is currently being processed. Please try again later.",
  INTERNAL_SERVER_ERROR:
    "An unexpected server error occurred. Please try again later.",
};
export type ErrorCode = keyof typeof errorCodeMap;

export type ErrorResponseBody = {
  error: {
    code: ErrorCode;
    message: string;
  };
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JsonValue),
    z.record(JsonValue),
  ])
);

const JsonResponse = z.object({
  status: z.number().int(),
  data: JsonValue,
  headers: z.record(z.string()),
});
type JsonResponse = z.infer<typeof JsonResponse>;

function encryptJsonResponse(response: JsonResponse) {
  const responseJson = JSON.stringify(response);
  return encryptAes256Gcm(responseJson);
}

export class JsonResponseError implements JsonResponse {
  constructor(
    public status: number,
    public data: JsonValue,
    public headers: Record<string, string> = {}
  ) {}

  toObject() {
    return {
      status: this.status,
      data: this.data,
      headers: this.headers,
    } satisfies JsonResponse;
  }

  static fromCode(
    status: number,
    code: ErrorCode,
    headers: Record<string, string> = {}
  ) {
    return new JsonResponseError(
      status,
      {
        error: {
          code,
          message: errorCodeMap[code],
        },
      } satisfies ErrorResponseBody,
      headers
    );
  }

  static async fromEncrypted(responseEncrypted: string | null) {
    if (responseEncrypted === null) {
      throw new Error("An encrypted response json string must exist.");
    }
    const responseJson = decryptAes256Gcm(responseEncrypted);
    const responseRaw = JSON.parse(responseJson);
    const response = await JsonResponse.parseAsync(responseRaw);
    return new JsonResponseError(
      response.status,
      response.data,
      response.headers
    );
  }
}

type Context = {
  request: Request;
  operation: string;
  options: Required<Options>;
  idempotencyKey: string;
  data: Map<string, unknown>;
};

type ContextIn1stTx = Context & {
  tx: Tx;
  idempotencyRequest: IdempotencyRequest;
};

type ContextIn2ndTx = ContextIn1stTx & {
  externalCallError: unknown;
};

export type Result = {
  kind: "success" | "failure" | "retry";
  response: JsonResponse;
};

type OnParseBefore1stTx = (c: Context) => MaybePromise<void>;
type OnParseIn1stTx = (c: ContextIn1stTx) => MaybePromise<void>;
type OnExternalCall = (c: Context) => MaybePromise<void>;
type OnParseIn2ndTx = (c: ContextIn2ndTx) => MaybePromise<Result>;
type OnErrorFrom2ndTx = (c: Context) => MaybePromise<void>;

type Options = {
  idempotencyKeyHeader?: string;
  maxAttemptCount?: number;
};

const DEFAULT_OPTIONS: Required<Options> = {
  idempotencyKeyHeader: "Idempotency-Key",
  maxAttemptCount: 3,
};

type Transaction<Client> = {
  client: Client;
  idempotencyRequest: {
    insert: (
      idempotencyKey: string,
      operation: string,
      maxAttemptCount: number
    ) => MaybePromise<void>;
    selectForUpdate: (idempotencyKey: string) => MaybePromise<void>;
    update: (
      idempotencyKey: string,
      status?: IdempotencyRequestStatus,
      responseEncrypted?: string,
      attemptCount?: number
    ) => MaybePromise<void>;
  };
};

type Input = {
  request: Request;
  db: {
    transaction: (tx: Tx) => MaybePromise<void>;
  };
  operation: string;
  options: Options;
  steps: {
    onParseBefore1stTx: OnParseBefore1stTx;
    onParseIn1stTx: OnParseIn1stTx;
    onExternalCall: OnExternalCall;
    onParseIn2ndTx: OnParseIn2ndTx;
    onErrorFrom2ndTx: OnErrorFrom2ndTx;
  };
};

type IdempotencyRequest = typeof idempotencyRequestsTable.$inferSelect;

async function tryInsertIdempotencyRequest(
  db: Db,
  idempotencyKey: string,
  operation: string,
  maxAttemptCount: number
) {
  const idempotencyRequests = await db
    .insert(idempotencyRequestsTable)
    .values({ idempotencyKey, operation, maxAttemptCount })
    .onConflictDoNothing({
      target: idempotencyRequestsTable.idempotencyKey,
    })
    .returning();
  if (idempotencyRequests.length === 0) {
    return null;
  }
  if (idempotencyRequests.length !== 1) {
    throw new Error("Exactly one idempotency request must exist.");
  }
  return idempotencyRequests[0];
}

async function trySelectIdempotencyRequestForUpdate(
  db: Db,
  idempotencyKey: string
) {
  const idempotencyRequests = await db
    .select()
    .from(idempotencyRequestsTable)
    .where(eq(idempotencyRequestsTable.idempotencyKey, idempotencyKey))
    .limit(1)
    .for("update");
  if (idempotencyRequests.length === 0) {
    return null;
  }
  return idempotencyRequests[0];
}

async function selectIdempotencyRequestForUpdate(
  db: Db,
  idempotencyKey: string
) {
  const idempotencyRequest = await trySelectIdempotencyRequestForUpdate(
    db,
    idempotencyKey
  );
  if (!idempotencyRequest) {
    throw new Error("Idempotent request must exist.");
  }
  return idempotencyRequest;
}

type UpdateIdempotencyRequestValues = Omit<
  PgUpdateSetSource<typeof idempotencyRequestsTable>,
  | "id"
  | "idempotencyKey"
  | "operation"
  | "maxAttemptCount"
  | "statusChangedAt"
  | "createdAt"
  | "updatedAt"
>;

async function updateIdempotencyRequest(
  db: Db,
  idempotencyKey: string,
  values: UpdateIdempotencyRequestValues
) {
  const valuesToUpdate = values.status
    ? ({
        ...values,
        statusChangedAt: new Date(),
      } satisfies UpdateIdempotencyRequestValues &
        Pick<
          PgUpdateSetSource<typeof idempotencyRequestsTable>,
          "statusChangedAt"
        >)
    : values;

  const idempotencyRequests = await db
    .update(idempotencyRequestsTable)
    .set({
      ...valuesToUpdate,
      updatedAt: new Date(),
    })
    .where(eq(idempotencyRequestsTable.idempotencyKey, idempotencyKey))
    .returning();
  if (idempotencyRequests.length === 0) {
    return null;
  }
  return idempotencyRequests[0];
}

async function processIdempotencyRequestIn1stTx(
  db: Db,
  idempotencyKey: string,
  operation: string,
  maxAttemptCount: number
) {
  await tryInsertIdempotencyRequest(
    db,
    idempotencyKey,
    operation,
    maxAttemptCount
  );
  const idempotencyRequest = await selectIdempotencyRequestForUpdate(
    db,
    idempotencyKey
  );
  const idempotencyRequestUpdated = await updateIdempotencyRequest(
    db,
    idempotencyKey,
    {
      attemptCount: idempotencyRequest.attemptCount + 1,
    }
  );
  if (!idempotencyRequestUpdated) {
    throw new Error("An updated identity request must exist.");
  }
  return idempotencyRequestUpdated;
}

async function updateIdempotencyRequestByResponse(
  db: Db,
  idempotencyKey: string,
  status: IdempotencyRequestStatus,
  response: JsonResponse
) {
  const responseEncrypted = encryptJsonResponse(response);
  await updateIdempotencyRequest(db, idempotencyKey, {
    status,
    responseEncrypted,
  });
}

export class Handler {
  #input: Input;
  #options: Required<Options>;

  constructor(input: Input) {
    this.#input = input;
    this.#options = this.#parseOptions();
  }

  async handle() {
    const { request, operation, steps } = this.#input;
    const { idempotencyKeyHeader } = this.#options;
    const idempotencyKey = this.#parseIdempotencyKey(idempotencyKeyHeader);

    const context: Context = {
      request,
      operation,
      options: this.#options,
      idempotencyKey,
      data: new Map<string, unknown>(),
    };
    const { onParseBefore1stTx, onExternalCall, onErrorFrom2ndTx } = steps;

    await onParseBefore1stTx(context);
    await this.#execute1stTx(context);

    let externalCallError: unknown = null;
    try {
      await onExternalCall(context);
    } catch (err) {
      externalCallError = err;
    }

    try {
      return await this.#execute2ndTx(context, externalCallError);
    } catch (err) {
      await onErrorFrom2ndTx(context);
      throw err;
    }
  }

  async #execute1stTx(c: Context) {
    const { db, steps } = this.#input;

    return await db.transaction(async (tx) => {
      const { idempotencyKey, operation, options } = c;
      const { maxAttemptCount } = options;
      const idempotencyRequest = await processIdempotencyRequestIn1stTx(
        tx,
        idempotencyKey,
        operation,
        maxAttemptCount
      );

      const { onParseIn1stTx } = steps;
      const contextIn1stTx: ContextIn1stTx = {
        ...c,
        tx,
        idempotencyRequest,
      };
      await onParseIn1stTx(contextIn1stTx);
      await this.#processByStatusIn1stTx(
        tx,
        idempotencyKey,
        idempotencyRequest
      );
    });
  }

  async #processByStatusIn1stTx(
    db: Db,
    idempotencyKey: string,
    idempotencyRequest: IdempotencyRequest
  ) {
    const { status, responseEncrypted } = idempotencyRequest;
    switch (status) {
      case "succeeded":
      case "failed":
        throw JsonResponseError.fromEncrypted(responseEncrypted);
      case "pending_external":
        throw JsonResponseError.fromCode(409, "EXTERNAL_REQUEST_IN_PROGRESS");
      case "created":
      case "retryable":
        await updateIdempotencyRequest(db, idempotencyKey, {
          status: "pending_external",
        });
        break;
      default:
        const _exhaustive: never = status;
        throw new Error(`Unhandled status: ${status}`);
    }
  }

  async #execute2ndTx(c: Context, externalCallError: unknown) {
    const { db, steps } = this.#input;

    return await db.transaction(async (tx) => {
      const { idempotencyKey } = c;
      const idempotencyRequest = await selectIdempotencyRequestForUpdate(
        tx,
        idempotencyKey
      );
      await this.#processByStatusIn2ndTx(idempotencyRequest);

      const { onParseIn2ndTx } = steps;
      const contextIn2ndTx: ContextIn2ndTx = {
        ...c,
        tx,
        idempotencyRequest,
        externalCallError,
      };
      const result = await onParseIn2ndTx(contextIn2ndTx);
      const { kind, response } = result;
      const { attemptCount, maxAttemptCount } = idempotencyRequest;
      switch (kind) {
        case "success":
          await updateIdempotencyRequestByResponse(
            tx,
            idempotencyKey,
            "succeeded",
            response
          );
          break;
        case "failure":
          await updateIdempotencyRequestByResponse(
            tx,
            idempotencyKey,
            "failed",
            response
          );
          break;
        case "retry":
          {
            const status: IdempotencyRequestStatus =
              attemptCount < maxAttemptCount ? "retryable" : "failed";
            await updateIdempotencyRequestByResponse(
              tx,
              idempotencyKey,
              status,
              response
            );
          }
          break;
        default:
          const _exhaustive: never = kind;
          throw new Error(`Unhandled kind: ${kind}`);
      }

      return response;
    });
  }

  async #processByStatusIn2ndTx(idempotencyRequest: IdempotencyRequest) {
    const { status, responseEncrypted } = idempotencyRequest;
    switch (status) {
      case "succeeded":
      case "failed":
        throw JsonResponseError.fromEncrypted(responseEncrypted);
      case "pending_external":
        // OK
        break;
      case "created":
        throw new Error(
          "The `created` state must have been handled in the 1st transaction."
        );
      case "retryable":
        {
        }
        break;
      default:
        const _exhaustive: never = status;
        throw new Error(`Unhandled status: ${status}`);
    }
  }

  #parseIdempotencyKey(idempotencyKeyHeader: string) {
    const idempotencyKey =
      this.#input.request.headers.get(idempotencyKeyHeader);
    if (!idempotencyKey) {
      throw JsonResponseError.fromCode(400, "IDEMPOTENCY_KEY_REQUIRED");
    }

    return idempotencyKey;
  }

  #parseOptions(): Required<Options> {
    const { options } = this.#input;
    return {
      idempotencyKeyHeader:
        options.idempotencyKeyHeader ?? DEFAULT_OPTIONS.idempotencyKeyHeader,
      maxAttemptCount:
        options.maxAttemptCount ?? DEFAULT_OPTIONS.maxAttemptCount,
    };
  }
}
