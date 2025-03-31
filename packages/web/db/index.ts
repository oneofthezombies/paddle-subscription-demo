import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

function initDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Please set DATABASE_URL env var.");
  }
  return drizzle(databaseUrl);
}

export const db = initDb();
export type Db = Pick<
  typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  | "delete"
  | "execute"
  | "insert"
  | "select"
  | "selectDistinct"
  | "selectDistinctOn"
  | "update"
>;
