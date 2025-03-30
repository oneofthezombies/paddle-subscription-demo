import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Please set DATABASE_URL env var.");
}

export const db = drizzle(databaseUrl);
