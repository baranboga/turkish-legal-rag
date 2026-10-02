// NOT: server-only KASITLI olarak eklenmedi — bu modul hem API route'u
// (/api/rag/ingest) hem de CLI (scripts/07-rag-ingest.ts, tsx) tarafindan
// import edilir. Hicbir client component bunu import etmez.
import { sql } from "drizzle-orm";
import {
  HNSW_EF_CONSTRUCTION,
  HNSW_M,
  OPENAI_EMBEDDING_DIM,
  OPENAI_PRICE_PER_1M_TOKENS,
  RAG_CHUNK_TABLE,
  type RagStrategy,
} from "../config";
import { loadRagRecords } from "../data";
import { db } from "../db/client";
import { embedOpenAiBatch } from "../embeddings/openai";
import { chunkDecision, type RawDecision } from "./chunk";
import type { Chunk, RagIngestEvent, RagIngestResult } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;

function chunkArr<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type ProgressCb = (e: Extract<RagIngestEvent, { type: "progress" }>) => void;

/**
 * Chunk tablosunu idempotent olarak kurar (raw DDL — drizzle migration'a DAHIL
 * DEGIL; repo'daki createHnswIndex ile ayni runtime-DDL yaklasimi). Boylece RAG
 * modulu kendi kendine yeter: "npm run rag:ingest" tek basina tablo + index kurar.
 */
async function ensureChunkTable(strategy: RagStrategy): Promise<void> {
  const table = RAG_CHUNK_TABLE[strategy];
  await db.execute(
    sql.raw(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id serial PRIMARY KEY,
      source_id text NOT NULL,
      karar_no text,
      tarih text,
      bolum text NOT NULL,
      chunk_index integer NOT NULL,
      token_estimate integer NOT NULL,
      text text NOT NULL,
      embedding vector(${OPENAI_EMBEDDING_DIM}) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  );
}

async function createChunkHnswIndex(strategy: RagStrategy): Promise<void> {
  const table = RAG_CHUNK_TABLE[strategy];
  const idx = `${table}_embedding_hnsw`;
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${idx}`));
  await db.execute(
    sql.raw(
      `CREATE INDEX ${idx} ON ${table} USING hnsw (embedding vector_cosine_ops) ` +
        `WITH (m = ${Number(HNSW_M)}, ef_construction = ${Number(HNSW_EF_CONSTRUCTION)})`
    )
  );
}

interface EmbeddedChunk extends Chunk {
  embedding: number[];
}

async function insertChunks(strategy: RagStrategy, rows: EmbeddedChunk[]): Promise<void> {
  const table = sql.raw(RAG_CHUNK_TABLE[strategy]);
  for (const part of chunkArr(rows, 100)) {
    const values = part.map(
      (c) =>
        sql`(${c.sourceId}, ${c.kararNo}, ${c.tarih}, ${c.bolum}, ${c.chunkIndex}, ${
          c.tokenEstimate
        }, ${c.text}, ${`[${c.embedding.join(",")}]`}::vector)`
    );
    await db.execute(sql`
      INSERT INTO ${table}
        (source_id, karar_no, tarih, bolum, chunk_index, token_estimate, text, embedding)
      VALUES ${sql.join(values, sql`, `)}
    `);
  }
}

/**
 * Bir stratejiyi bastan ingest eder: rag-raw.json'u oku -> chunk et -> OpenAI ile
 * embed et -> pgvector tablosuna yaz (temizle + yeniden) -> HNSW index kur.
 * Server-side olcum: chunkMs / embedMs / storeMs. Batch basina progress bildirir.
 */
export async function ingestStrategy(
  strategy: RagStrategy,
  onProgress: ProgressCb = () => {}
): Promise<RagIngestResult> {
  const records = loadRagRecords();
  const decisions: RawDecision[] = records.map((r) => ({
    sourceId: r.sourceId,
    text: r.text,
    date: r.date,
  }));

  // 1) chunk
  onProgress({ type: "progress", phase: "chunk", message: "chunk'lar olusturuluyor" });
  const tChunk0 = performance.now();
  const chunks: Chunk[] = decisions.flatMap((d) => chunkDecision(d, strategy));
  const chunkMs = round(performance.now() - tChunk0);
  if (chunks.length === 0) throw new Error("Hic chunk uretilemedi (rag-raw.json bos olabilir).");

  // 2) embed (OpenAI batch)
  const embeddings: (number[] | null)[] = new Array(chunks.length).fill(null);
  const errors: string[] = [];
  let tokens = 0;
  let failures = 0;
  const batches = chunkArr(
    chunks.map((c, i) => ({ text: c.text, i })),
    100
  );
  const tEmbed0 = performance.now();
  let done = 0;
  for (const batch of batches) {
    try {
      const { embeddings: vecs, totalTokens } = await embedOpenAiBatch(batch.map((b) => b.text));
      batch.forEach((b, j) => (embeddings[b.i] = vecs[j]));
      tokens += totalTokens;
    } catch (e) {
      failures += batch.length;
      errors.push((e as Error).message);
    }
    done += batch.length;
    onProgress({ type: "progress", phase: "embed", done, total: chunks.length });
  }
  const embedMs = round(performance.now() - tEmbed0);

  const embedded: EmbeddedChunk[] = chunks
    .map((c, i) => ({ ...c, embedding: embeddings[i] }))
    .filter((c): c is EmbeddedChunk => c.embedding !== null);
  if (embedded.length === 0) {
    throw new Error(`Embedding uretilemedi. ${errors[0] ?? "bilinmeyen hata"}`);
  }

  // 3) store (temizle + yeniden yaz + HNSW index)
  onProgress({
    type: "progress",
    phase: "store",
    message: `${RAG_CHUNK_TABLE[strategy]} tablosuna yaziliyor + HNSW index`,
  });
  const tStore0 = performance.now();
  await ensureChunkTable(strategy);
  await db.execute(sql.raw(`TRUNCATE TABLE ${RAG_CHUNK_TABLE[strategy]} RESTART IDENTITY`));
  await insertChunks(strategy, embedded);
  await createChunkHnswIndex(strategy);
  const storeMs = round(performance.now() - tStore0);

  const docsWithKararNo = new Set(
    embedded.filter((c) => c.kararNo).map((c) => c.sourceId)
  ).size;

  return {
    strategy,
    table: RAG_CHUNK_TABLE[strategy],
    documents: decisions.length,
    chunks: embedded.length,
    avgChunksPerDoc: round(embedded.length / decisions.length),
    withKararNo: docsWithKararNo,
    failures,
    tokens,
    estCostUsd: (tokens / 1_000_000) * OPENAI_PRICE_PER_1M_TOKENS,
    chunkMs,
    embedMs,
    storeMs,
    totalMs: round(chunkMs + embedMs + storeMs),
    errors,
    indexedAt: new Date().toISOString(),
  };
}
