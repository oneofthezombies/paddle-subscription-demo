import { integer, pgTable, text } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  emailEncrypted: text("email_encrypted").notNull(),
  emailHash: text("email_hash").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
});
