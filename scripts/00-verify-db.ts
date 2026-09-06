/**
 * Dogrulama #2 — Supabase pgvector surumu ve HNSW destegi.
 *
 * DIRECT_URL (port 5432) uzerinden calisir. Extension'i enable eder ve
 * surum + kullanilabilir index access method'larini raporlar.
 *
 *   npm run verify:db
 */
import "dotenv/config";
import postgres from "postgres";
import { requireEnv } from "../src/env";

async function main(): Promise<void> {
  const sql = postgres(requireEnv("DIRECT_URL"), { max: 1 });
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;

    const [pg] = await sql<{ version: string }[]>`SELECT version()`;
    const [installed] = await sql<{ extversion: string | null }[]>`
      SELECT extversion FROM pg_extension WHERE extname = 'vector'
    `;
    const avail = await sql<
      { name: string; default_version: string; installed_version: string | null }[]
    >`
      SELECT name, default_version, installed_version
      FROM pg_available_extensions WHERE name = 'vector'
    `;
    const ams = await sql<{ amname: string }[]>`
      SELECT amname FROM pg_am WHERE amname IN ('hnsw', 'ivfflat')
    `;

    const amNames = ams.map((r) => r.amname);
    console.log("== pgvector / HNSW dogrulama ==");
    console.log("Postgres         :", pg.version);
    console.log("pgvector kurulu  :", installed?.extversion ?? "(kurulu degil)");
    console.log("pgvector mevcut  :", avail[0]);
    console.log("index access mth :", amNames.length ? amNames.join(", ") : "(yok)");
    console.log("HNSW destegi     :", amNames.includes("hnsw") ? "VAR" : "YOK");
    console.log("IVFFlat destegi  :", amNames.includes("ivfflat") ? "VAR" : "YOK");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
