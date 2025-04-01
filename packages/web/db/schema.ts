import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
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

export const IdempotencyRequestStatus = [
  "created",
  "pending_external",
  "retryable",
  "succeeded",
  "failed",
] as const;
export type IdempotencyRequestStatus =
  (typeof IdempotencyRequestStatus)[number];

export const idempotencyRequestStatusEnum = pgEnum(
  "idempotency_request_status",
  IdempotencyRequestStatus
);

export const idempotencyRequestsTable = pgTable("idempotency_requests", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: idempotencyRequestStatusEnum("status").notNull().default("created"),
  operation: text().notNull(),
  responseEncrypted: text("response_encrypted"),
  attemptCount: integer("attempt_count").notNull().default(0),
  maxAttemptCount: integer("max_attempt_count").notNull(),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
