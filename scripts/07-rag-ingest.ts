/**
 * Adim (RAG) — Chunk + embed + pgvector'e yaz.
 *
 * Her chunking stratejisi (fixed, structure) icin:
 *   rag-raw.json oku -> chunk et -> OpenAI ile embed et -> kendi pgvector
 *   tablosuna yaz (rag_chunks_fixed / rag_chunks_structure) + HNSW index kur.
 * Tablolar idempotent raw DDL ile olusturulur (drizzle migration GEREKMEZ).
 *
 * Kullanim:
 *   npm run rag:ingest            # iki stratejiyi de ingest eder
 *   npm run rag:ingest -- fixed   # yalnizca fixed
 *   npm run rag:ingest -- structure
 *
 * Cikti: Postgres tablolari + konsolda ozet. (Dosyaya yazmaz; live /chat okur.)
 */
import "dotenv/config";
import { RAG_STRATEGIES, type RagStrategy } from "../src/config";
import { queryClient } from "../src/db/client";
import { ingestStrategy } from "../src/rag/ingest";

function parseStrategies(): RagStrategy[] {
  const arg = process.argv[2]?.trim();
  if (!arg) return [...RAG_STRATEGIES];
  if (!RAG_STRATEGIES.includes(arg as RagStrategy)) {
    throw new Error(`Gecersiz strateji: "${arg}". Secenekler: ${RAG_STRATEGIES.join(", ")}`);
  }
  return [arg as RagStrategy];
}

async function main(): Promise<void> {
  const strategies = parseStrategies();
  for (const strategy of strategies) {
    console.log(`\n[rag-ingest] strateji: ${strategy}`);
    const r = await ingestStrategy(strategy, (e) => {
      if (e.phase === "embed" && e.done != null) {
        process.stdout.write(`  embed ${e.done}/${e.total}\r`);
      } else if (e.message) {
        process.stdout.write(`  ${e.phase}: ${e.message}\n`);
      }
    });
    console.log(
      `\n[rag-ingest] ${strategy} tamam -> ${r.table}\n` +
        `  dokuman: ${r.documents} · chunk: ${r.chunks} (ort ${r.avgChunksPerDoc}/dok) · ` +
        `karar no'lu dok: ${r.withKararNo}\n` +
        `  token: ${r.tokens} · ~maliyet: $${r.estCostUsd.toFixed(6)} · failures: ${r.failures}\n` +
        `  sure: chunk ${r.chunkMs}ms · embed ${r.embedMs}ms · store ${r.storeMs}ms · ` +
        `toplam ${r.totalMs}ms`
    );
    if (r.errors.length) console.warn(`  errors:\n   ${r.errors.join("\n   ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
