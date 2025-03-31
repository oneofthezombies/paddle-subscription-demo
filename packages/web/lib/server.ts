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
import { Db } from "@/db";
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";
import { eq } from "drizzle-orm";
import { PgInsertValue, PgUpdateSetSource } from "drizzle-orm/pg-core";

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
  create_user__paddle_customer_creation_to_request: z.object({}),
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

export function respondJson(
  status: number,
  data: any,
  headers: HeadersInit | undefined = undefined
) {
  return Response.json(data, {
    status,
    headers,
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

export function users(db: Db) {
  return {
    async insert(values: PgInsertValue<typeof Users>) {
      const users = await db.insert(Users).values(values).returning();
      return users[0];
    },
    async findById(userId: number) {
      const users = await db
        .select()
        .from(Users)
        .where(eq(Users.id, userId))
        .limit(1);
      if (users.length === 0) {
        return null;
      }
      return users[0];
    },
    async findByEmail(emailHash: string) {
      const users = await db
        .select()
        .from(Users)
        .where(eq(Users.emailHash, emailHash))
        .limit(1);
      if (users.length === 0) {
        return null;
      }
      return users[0];
    },
  };
}

export function idemTasks(db: Db) {
  return {
    async tryInsert(values: PgInsertValue<typeof IdemTasks>) {
      await db
        .insert(IdemTasks)
        .values(values)
        .onConflictDoNothing({ target: IdemTasks.idempotencyKey });
    },
    async selectForUpdate(idempotencyKey: string) {
      const tasks = await db
        .select()
        .from(IdemTasks)
        .where(eq(IdemTasks.idempotencyKey, idempotencyKey))
        .limit(1)
        .for("update");
      if (tasks.length == 0) {
        return null;
      }
      return tasks[0];
    },
    async update(
      idempotencyKey: string,
      values: Omit<
        PgUpdateSetSource<typeof IdemTasks>,
        "idempotencyKey" | "updatedAt"
      >
    ) {
      await db
        .update(IdemTasks)
        .set({
          ...values,
          updatedAt: new Date(),
        })
        .where(eq(IdemTasks.idempotencyKey, idempotencyKey));
    },
  };
}
