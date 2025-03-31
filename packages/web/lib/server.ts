import {
  createCipheriv,
  randomBytes,
  createDecipheriv,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import {
  IdemTaskOperation,
  IdemTasks,
  IdemTaskStatus,
  IdemTaskStep,
  Users,
} from "@/db/schema";
import { DbClient } from "@/db";
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";
import { eq } from "drizzle-orm";
import { PgUpdateSetSource } from "drizzle-orm/pg-core";

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

export async function sha256Hex(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

export async function hashEmail(email: string) {
  return await sha256Hex(`email:${email}`);
}

export async function hashPassword(password: string) {
  return await sha256Hex(`password:${password}`);
}

export const IdemTaskCtx = {
  create_user__paddle_customer_creation_requested: z.object({}),
  create_user__user_created: z.object({
    userId: z.number().int(),
  }),
} as const satisfies Record<IdemTaskStep, z.ZodTypeAny>;

export const paddle = initPaddle();

function initPaddle() {
  const paddleApiKey = process.env.PADDLE_API_KEY;
  if (!paddleApiKey) {
    throw new Error("Please set Paddle API Key.");
  }

  const paddle = new Paddle(paddleApiKey, {
    environment: Environment.sandbox,
    logLevel: LogLevel.verbose,
  });

  return paddle;
}

export function respondJson(status: number, data: any) {
  return Response.json(data, {
    status,
  });
}

export async function createPaddleCustomer(email: string) {
  return await paddle.customers.create({ email });
}

export async function deletePaddleCustomer(
  paddleCustomerId: string,
  email: string
) {
  const uuid = randomUUID();
  await paddle.customers.update(paddleCustomerId, {
    email: `${uuid}+${email}`,
    status: "archived",
  });
}

export async function findUserByEmail(c: DbClient, emailHash: string) {
  const users = await c
    .select()
    .from(Users)
    .where(eq(Users.emailHash, emailHash))
    .limit(1);
  if (users.length === 0) {
    return null;
  }
  return users[0];
}

export async function findUserById(c: DbClient, userId: number) {
  const users = await c
    .select()
    .from(Users)
    .where(eq(Users.id, userId))
    .limit(1);
  if (users.length === 0) {
    return null;
  }
  return users[0];
}

export async function createUser(
  c: DbClient,
  emailEncrypted: string,
  emailHash: string,
  passwordHash: string,
  paddleCustomerId: string
) {
  const users = await c
    .insert(Users)
    .values({
      emailEncrypted,
      emailHash,
      passwordHash,
      paddleCustomerId,
    })
    .returning();
  return users[0];
}

export async function selectIdemTaskForUpdate(
  c: DbClient,
  idempotencyKey: string
) {
  const tasks = await c
    .select()
    .from(IdemTasks)
    .where(eq(IdemTasks.idempotencyKey, idempotencyKey))
    .limit(1)
    .for("update");
  if (tasks.length == 0) {
    return null;
  }
  return tasks[0];
}

export async function insertIdemTask(
  c: DbClient,
  idempotencyKey: string,
  operation: IdemTaskOperation
) {
  const tasks = await c
    .insert(IdemTasks)
    .values({
      idempotencyKey,
      operation,
    })
    .returning();
  return tasks[0];
}

export async function updateIdemTaskStep(
  c: DbClient,
  idempotencyKey: string,
  step: IdemTaskStep
) {
  await c
    .update(IdemTasks)
    .set({
      step,
      updatedAt: new Date(),
    })
    .where(eq(IdemTasks.idempotencyKey, idempotencyKey));
}

export async function updateIdemTaskStatus(
  c: DbClient,
  idempotencyKey: string,
  status: IdemTaskStatus
) {
  await c
    .update(IdemTasks)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(IdemTasks.idempotencyKey, idempotencyKey));
}

export async function updateIdemCols(
  c: DbClient,
  idempotencyKey: string,
  values: Omit<
    PgUpdateSetSource<typeof IdemTasks>,
    "idempotencyKey" | "updatedAt"
  >
) {
  await c
    .update(IdemTasks)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(IdemTasks.idempotencyKey, idempotencyKey));
}
