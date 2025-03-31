import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const Users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  emailEncrypted: text("email_encrypted").notNull(),
  emailHash: text("email_hash").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  paddleCustomerId: text("paddle_customer_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const IdemTaskStatus = [
  "started",
  "to_request",
  "retryable",
  "succeeded",
  "failed",
] as const;
export type IdemTaskStatus = (typeof IdemTaskStatus)[number];
export const IdemTaskStatusEnum = pgEnum("idem_task_status", IdemTaskStatus);

export const IdemTaskOperation = ["create_user"] as const;
export type IdemTaskOperation = (typeof IdemTaskOperation)[number];
export const IdemTaskOperationEnum = pgEnum(
  "idem_task_operation",
  IdemTaskOperation
);

export function defineIdemTaskStep<
  P extends IdemTaskOperation,
  V extends readonly string[]
>(prefix: P, values: V): [`${P}__${V[number]}`] {
  return values.map((v) => `${prefix}__${v}`) as any;
}

export const IdemTaskStepCreateUser = defineIdemTaskStep("create_user", [
  "paddle_customer_creation_to_request",
  "user_created",
] as const);
export type IdemTaskStepCreateUser = (typeof IdemTaskStepCreateUser)[number];
export const IdemTaskStep = [...IdemTaskStepCreateUser] as const;
export type IdemTaskStep = (typeof IdemTaskStep)[number];
export const IdemTaskStepEnum = pgEnum("idem_task_step", IdemTaskStep);

export const IdemTasks = pgTable("idem_tasks", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  status: IdemTaskStatusEnum("status").notNull().default("started"),
  operation: IdemTaskOperationEnum("operation").notNull(),
  step: IdemTaskStepEnum("step"),
  context: jsonb("context").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
