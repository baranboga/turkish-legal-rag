/**
 * Adim 4 — Pinecone.
 *
 * Iki AYRI cosine index olusturur (varsa yeniden kullanir):
 *   - PINECONE_INDEX_OPENAI  (1536)
 *   - PINECONE_INDEX_HF      (768 / HF_EMBEDDING_DIM)
 *
 * Embedding'ler Postgres'ten (Adim 3'te yazilanlar) okunur ve ayni 400 kayit
 * ikisine de upsert edilir. Metadata'ya SADECE documentId + year + category
 * yazilir; `text` yazilMAZ. Upsert suresi loglanir.
 * Ozet -> results/<run>/pinecone-stats.json
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { PineconeRecord, RecordMetadata } from "@pinecone-database/pinecone";
import {
  EMBED_DIM,
  PINECONE_INDEX,
  PROVIDERS,
  resultsDir,
  type Provider,
} from "../src/config";
import { db, queryClient } from "../src/db/client";
import { documents, embeddingsHf, embeddingsOpenai } from "../src/db/schema";
import { getPinecone } from "../src/pinecone";

const UPSERT_BATCH = 100;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface DbRow {
  documentId: number;
  embedding: number[];
  year: number | null;
  category: string | null;
}

async function readRows(provider: Provider): Promise<DbRow[]> {
  const emb = provider === "openai" ? embeddingsOpenai : embeddingsHf;
  return db
    .select({
      documentId: emb.documentId,
      embedding: emb.embedding,
      year: documents.year,
      category: documents.category,
    })
    .from(emb)
    .innerJoin(documents, eq(emb.documentId, documents.id));
}

function toRecord(row: DbRow): PineconeRecord {
  const metadata: RecordMetadata = { documentId: row.documentId };
  if (row.year != null) metadata.year = row.year;
  if (row.category != null) metadata.category = row.category;
  return { id: String(row.documentId), values: row.embedding, metadata };
}

async function setupProvider(provider: Provider): Promise<{ upsertMs: number; count: number }> {
  const name = PINECONE_INDEX[provider];
  const dimension = EMBED_DIM[provider];
  const pc = getPinecone();

  console.log(`\n[${provider}] ensuring index "${name}" (dim ${dimension}, cosine)`);
  await pc.createIndex({
    name,
    dimension,
    metric: "cosine",
    spec: { serverless: { cloud: "aws", region: "us-east-1" } },
    waitUntilReady: true,
    suppressConflicts: true, // varsa hata verme, yeniden kullan
  });

  const rows = await readRows(provider);
  const records = rows.map(toRecord);
  console.log(`[${provider}] upserting ${records.length} vectors...`);

  const index = pc.index(name);
  const start = performance.now();
  for (const part of chunk(records, UPSERT_BATCH)) {
    await index.upsert({ records: part });
  }
  const upsertMs = Math.round(performance.now() - start);
  console.log(`[${provider}] upsert done in ${upsertMs}ms`);
  return { upsertMs, count: records.length };
}

async function main(): Promise<void> {
  const stats: Record<string, { upsertMs: number; count: number; index: string; dim: number }> = {};
  for (const provider of PROVIDERS) {
    const r = await setupProvider(provider);
    stats[provider] = { ...r, index: PINECONE_INDEX[provider], dim: EMBED_DIM[provider] };
  }
  mkdirSync(resultsDir(), { recursive: true });
  writeFileSync(`${resultsDir()}/pinecone-stats.json`, JSON.stringify(stats, null, 2), "utf8");
  console.log(`\nWrote ${resultsDir()}/pinecone-stats.json`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
