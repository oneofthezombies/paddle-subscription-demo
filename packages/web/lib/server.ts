import {
  createCipheriv,
  randomBytes,
  createDecipheriv,
  randomUUID,
} from "node:crypto";
import { z } from "zod";
import { usersTable } from "@/db/schema";
import { Db } from "@/db";
import { Environment, LogLevel, Paddle } from "@paddle/paddle-node-sdk";
import { eq } from "drizzle-orm";
import { PgInsertValue, PgUpdateSetSource } from "drizzle-orm/pg-core";

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
    async insert(values: PgInsertValue<typeof usersTable>) {
      const users = await db.insert(usersTable).values(values).returning();
      return users[0];
    },
    async findById(userId: number) {
      const users = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (users.length === 0) {
        return null;
      }
      return users[0];
    },
    async findByEmail(emailHash: string) {
      const users = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.emailHash, emailHash))
        .limit(1);
      if (users.length === 0) {
        return null;
      }
      return users[0];
    },
  };
}
