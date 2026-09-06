import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * Migration'lar DIRECT connection (port 5432) uzerinden calisir.
 * Pooler (6543) migration icin kullanilmaz.
 */
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? "",
  },
  strict: true,
  verbose: true,
});
