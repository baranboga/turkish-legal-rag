/**
 * Adim 3 — Embedding uretimi.
 *
 * 400 dokumani iki saglayiciyla embed eder ve Postgres'e yazar:
 *   - OpenAI text-embedding-3-small (1536)
 *   - HF feature-extraction (default: intfloat/multilingual-e5-base, 768)
 *
 * Once documents tablosu TRUNCATE + RESTART IDENTITY ile sifirlanir; boylece
 * id'ler her kosuda deterministik olarak 1..400 (raw.json sirasi) olur.
 * HF tarafinda dokumanlara "passage: " prefix'i (E5) otomatik uygulanir.
 *
 * Loglar: her saglayici icin toplam sure + basarisiz istek sayisi;
 * OpenAI icin toplam token + tahmini maliyet. Ozet -> results/<run>/embed-stats.json
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import {
  HF_EMBEDDING_DIM,
  HF_EMBEDDING_MODEL,
  OPENAI_EMBEDDING_MODEL,
  OPENAI_PRICE_PER_1M_TOKENS,
  resultsDir,
} from "../src/config";
import { loadRawRecords } from "../src/data";
import { db, queryClient } from "../src/db/client";
import { documents, embeddingsHf, embeddingsOpenai } from "../src/db/schema";
import { embedOpenAiBatch } from "../src/embeddings/openai";
import { embedHfPassages } from "../src/embeddings/hf";
import type { EmbedProviderStats } from "../src/types";

const OPENAI_BATCH = 100;
const HF_BATCH = 16;
const HF_DELAY_MS = 400;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Doc {
  id: number;
  text: string;
}

async function insertDocuments(): Promise<Doc[]> {
  const records = loadRawRecords();
  console.log(`Truncating documents + inserting ${records.length} rows...`);
  await db.execute(sql`TRUNCATE TABLE documents RESTART IDENTITY CASCADE`);

  const docs: Doc[] = [];
  for (const part of chunk(records, 200)) {
    const rows = await db
      .insert(documents)
      .values(
        part.map((r) => ({
          sourceId: r.sourceId,
          text: r.text,
          year: r.year ?? null,
          category: r.category,
        }))
      )
      .returning({ id: documents.id });
    rows.forEach((row, i) => docs.push({ id: row.id, text: part[i].text }));
  }
  console.log(`Inserted ${docs.length} documents (ids ${docs[0].id}..${docs[docs.length - 1].id})`);
  return docs;
}

async function embedOpenAi(docs: Doc[]): Promise<EmbedProviderStats> {
  console.log(`\n[OpenAI] ${OPENAI_EMBEDDING_MODEL} — ${docs.length} docs, batch ${OPENAI_BATCH}`);
  const embeddings: (number[] | null)[] = new Array(docs.length).fill(null);
  let totalTokens = 0;
  let failures = 0;
  const start = performance.now();

  const batches = chunk(
    docs.map((d, i) => ({ text: d.text, i })),
    OPENAI_BATCH
  );
  for (const batch of batches) {
    const inputs = batch.map((b) => b.text);
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const { embeddings: vecs, totalTokens: t } = await embedOpenAiBatch(inputs);
        batch.forEach((b, j) => (embeddings[b.i] = vecs[j]));
        totalTokens += t;
        ok = true;
      } catch (e) {
        if (attempt === 0) {
          await sleep(1500);
        } else {
          failures += inputs.length;
          console.warn(`  batch failed (${inputs.length} inputs): ${(e as Error).message}`);
        }
      }
    }
    process.stdout.write(`  ${embeddings.filter(Boolean).length}/${docs.length}\r`);
  }
  const totalMs = Math.round(performance.now() - start);

  await storeEmbeddings("openai", docs, embeddings);
  const estCostUsd = (totalTokens / 1_000_000) * OPENAI_PRICE_PER_1M_TOKENS;
  console.log(
    `\n[OpenAI] done in ${totalMs}ms — failures: ${failures}, tokens: ${totalTokens}, ` +
      `est cost: $${estCostUsd.toFixed(6)}`
  );
  return {
    totalMs,
    failures,
    count: embeddings.filter(Boolean).length,
    totalTokens,
    estCostUsd,
  };
}

async function embedHf(docs: Doc[]): Promise<EmbedProviderStats> {
  console.log(
    `\n[HF] ${HF_EMBEDDING_MODEL} (${HF_EMBEDDING_DIM}d) — ${docs.length} docs, batch ${HF_BATCH}`
  );
  const embeddings: (number[] | null)[] = new Array(docs.length).fill(null);
  let failures = 0;
  const start = performance.now();

  const batches = chunk(
    docs.map((d, i) => ({ text: d.text, i })),
    HF_BATCH
  );
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const inputs = batch.map((x) => x.text);
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      try {
        const vecs = await embedHfPassages(inputs);
        batch.forEach((x, j) => (embeddings[x.i] = vecs[j]));
        ok = true;
      } catch (e) {
        if (attempt === 0) {
          await sleep(2000);
        } else {
          failures += inputs.length;
          console.warn(`  batch failed (${inputs.length} inputs): ${(e as Error).message}`);
        }
      }
    }
    process.stdout.write(`  ${embeddings.filter(Boolean).length}/${docs.length}\r`);
    if (b < batches.length - 1) await sleep(HF_DELAY_MS); // rate limit'e nazik ol
  }
  const totalMs = Math.round(performance.now() - start);

  await storeEmbeddings("hf", docs, embeddings);
  console.log(`\n[HF] done in ${totalMs}ms — failures: ${failures}`);
  return { totalMs, failures, count: embeddings.filter(Boolean).length };
}

async function storeEmbeddings(
  provider: "openai" | "hf",
  docs: Doc[],
  embeddings: (number[] | null)[]
): Promise<void> {
  const table = provider === "openai" ? embeddingsOpenai : embeddingsHf;
  const rows = docs
    .map((d, i) => ({ documentId: d.id, embedding: embeddings[i] }))
    .filter((r): r is { documentId: number; embedding: number[] } => r.embedding !== null);
  for (const part of chunk(rows, 100)) {
    await db.insert(table).values(part);
  }
}

async function main(): Promise<void> {
  const docs = await insertDocuments();
  const openai = await embedOpenAi(docs);
  const hf = await embedHf(docs);

  const stats: Record<string, EmbedProviderStats> = { openai, hf };
  mkdirSync(resultsDir(), { recursive: true });
  writeFileSync(`${resultsDir()}/embed-stats.json`, JSON.stringify(stats, null, 2), "utf8");
  console.log(`\nWrote ${resultsDir()}/embed-stats.json`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
