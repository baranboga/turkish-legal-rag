/**
 * Gecici kontrol: tablolar var mi, kac satir var, HNSW index'i acilmis mi.
 * DIRECT_URL (5432) uzerinden calisir.
 */
import "dotenv/config";
import postgres from "postgres";
import { requireEnv } from "../src/env";

async function main(): Promise<void> {
  const sql = postgres(requireEnv("DIRECT_URL"), { max: 1 });
  try {
    const tables = await sql<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `;
    console.log("== Public semadaki tablolar ==");
    console.log(tables.map((t) => t.tablename).join(", ") || "(hic tablo yok)");

    const names = new Set(tables.map((t) => t.tablename));
    for (const t of ["documents", "embeddings_openai", "embeddings_hf"]) {
      if (names.has(t)) {
        const [{ count }] = await sql<{ count: string }[]>`
          SELECT COUNT(*)::text AS count FROM ${sql(t)}
        `;
        console.log(`${t.padEnd(20)}: ${count} satir`);
      } else {
        console.log(`${t.padEnd(20)}: (tablo yok)`);
      }
    }

    const idx = await sql<{ indexname: string; tablename: string }[]>`
      SELECT indexname, tablename FROM pg_indexes
      WHERE schemaname = 'public'
        AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%ivfflat%')
      ORDER BY tablename
    `;
    console.log("== Vector index'ler (hnsw/ivfflat) ==");
    console.log(idx.length ? idx.map((i) => `${i.tablename}.${i.indexname}`).join(", ") : "(vector index yok)");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
