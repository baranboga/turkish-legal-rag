import "server-only";
import { sql } from "drizzle-orm";
import {
  HNSW_EF_SEARCH,
  OPENAI_PRICE_PER_1M_TOKENS,
  RAG_CHUNK_TABLE,
  RAG_TOP_K_DEFAULT,
  RAG_TOP_K_MAX,
  type RagStrategy,
} from "../config";
import { db } from "../db/client";
import { embedOpenAiBatch } from "../embeddings/openai";
import type { RagHit, RetrievalTiming } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;

export interface RetrieveResult {
  hits: RagHit[];
  timing: RetrievalTiming;
}

/** Top-k'yi 1..RAG_TOP_K_MAX araligina kelepceler. */
export function clampTopK(topK: unknown): number {
  const n = Math.floor(Number(topK));
  if (!Number.isFinite(n)) return RAG_TOP_K_DEFAULT;
  return Math.min(Math.max(1, n), RAG_TOP_K_MAX);
}

interface Row {
  chunkId: number | string;
  sourceId: string;
  kararNo: string | null;
  tarih: string | null;
  bolum: string | null;
  chunkIndex: number | string;
  score: number | string;
  text: string;
}

/**
 * retrieve(): sorguyu embed eder (OpenAI), ilgili strateji tablosunda pgvector
 * cosine ile top-k chunk'i skorla doner. Embed ve arama suresi AYRI olculur.
 * Sorgu embedding'inin gercek token/maliyeti de doner (UI maliyet paneli icin).
 */
export async function retrieve(
  queryText: string,
  strategy: RagStrategy,
  topK: number = RAG_TOP_K_DEFAULT
): Promise<RetrieveResult> {
  const k = clampTopK(topK);
  const table = sql.raw(RAG_CHUNK_TABLE[strategy]);

  const t0 = performance.now();
  const { embeddings, totalTokens } = await embedOpenAiBatch([queryText]);
  const vec = `[${embeddings[0].join(",")}]`;
  const t1 = performance.now();

  const rows = (await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${Number(HNSW_EF_SEARCH)}`));
    return await tx.execute(sql`
      SELECT id AS "chunkId", source_id AS "sourceId", karar_no AS "kararNo",
             tarih, bolum, chunk_index AS "chunkIndex",
             1 - (embedding <=> ${vec}::vector) AS score, text
      FROM ${table}
      ORDER BY embedding <=> ${vec}::vector
      LIMIT ${k}
    `);
  })) as unknown as Row[];
  const t2 = performance.now();

  const hits: RagHit[] = rows.map((r) => ({
    chunkId: Number(r.chunkId),
    sourceId: String(r.sourceId),
    kararNo: r.kararNo ?? null,
    tarih: r.tarih ?? null,
    bolum: r.bolum ?? "—",
    chunkIndex: Number(r.chunkIndex),
    score: Number(r.score),
    text: String(r.text),
  }));

  const timing: RetrievalTiming = {
    embedMs: round(t1 - t0),
    searchMs: round(t2 - t1),
    totalMs: round(t2 - t0),
    queryTokens: totalTokens,
    queryCostUsd: (totalTokens / 1_000_000) * OPENAI_PRICE_PER_1M_TOKENS,
  };
  return { hits, timing };
}
