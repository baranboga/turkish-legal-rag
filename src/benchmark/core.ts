import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { RecordMetadata } from "@pinecone-database/pinecone";
import {
  EMBED_DIM,
  OPENAI_PRICE_PER_1M_TOKENS,
  PINECONE_INDEX,
  TOP_K,
  resultsDir,
} from "../config";
import { loadRawRecords } from "../data";
import { db } from "../db/client";
import { documents, embeddingsHf, embeddingsOpenai } from "../db/schema";
import { embedHfPassages } from "../embeddings/hf";
import { embedOpenAiBatch } from "../embeddings/openai";
import { getPinecone } from "../pinecone";
import { embedQuery, runSearch } from "../search";
import { createHnswIndex } from "../search/pgvector";
import type {
  BenchRun,
  EnrichedHit,
  IndexEvent,
  IndexResult,
  SearchComboResult,
} from "./api-types";
import { getCombo, type Combo } from "./combos";
import { round } from "./stats";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function preview(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
}

// --- index sonuclarini diske kaydet: results/<run>/index-stats.json ---
const indexStatsFile = () => `${resultsDir()}/index-stats.json`;

export function loadIndexStats(): Record<string, IndexResult> {
  try {
    return JSON.parse(readFileSync(indexStatsFile(), "utf8")) as Record<string, IndexResult>;
  } catch {
    return {};
  }
}

function persistIndexResult(result: IndexResult): void {
  const all = loadIndexStats();
  all[result.comboId] = result;
  mkdirSync(resultsDir(), { recursive: true });
  writeFileSync(indexStatsFile(), JSON.stringify(all, null, 2), "utf8");
}

interface SeedDoc {
  id: number;
  text: string;
  year: number | null;
  category: string | null;
}

/** documents tablosu boş/eksikse raw.json'dan seed eder; doluysa yeniden kullanır. */
export async function ensureDocumentsSeeded(): Promise<SeedDoc[]> {
  const records = loadRawRecords();
  const existing = await db
    .select({
      id: documents.id,
      text: documents.text,
      year: documents.year,
      category: documents.category,
    })
    .from(documents)
    .orderBy(documents.id);

  if (existing.length === records.length) return existing;

  await db.execute(sql`TRUNCATE TABLE documents RESTART IDENTITY CASCADE`);
  const docs: SeedDoc[] = [];
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
    rows.forEach((row, i) =>
      docs.push({ id: row.id, text: part[i].text, year: part[i].year ?? null, category: part[i].category })
    );
  }
  return docs;
}

/**
 * Bir kombinasyonu indexler: 400 dokümanı combo'nun provider'ıyla embed eder,
 * sonra store'a yazar (pgvector: Postgres + HNSW / pinecone: index + upsert).
 * Server-side ölçüm: embedTimeMs / storeTimeMs / totalTimeMs.
 * Batch başına progress callback ile ilerleme raporlar.
 */
export async function indexCombo(
  comboId: string,
  onProgress: (e: Extract<IndexEvent, { type: "progress" }>) => void
): Promise<IndexResult> {
  const combo = getCombo(comboId);
  if (!combo) throw new Error(`Bilinmeyen kombinasyon: ${comboId}`);

  onProgress({ type: "progress", phase: "seed", message: "documents seed ediliyor" });
  const docs = await ensureDocumentsSeeded();

  const embeddings: (number[] | null)[] = new Array(docs.length).fill(null);
  const errors: string[] = [];
  let tokens = 0;
  let failures = 0;

  const batchSize = combo.provider === "openai" ? 100 : 16;
  const batches = chunk(
    docs.map((d, i) => ({ text: d.text, i })),
    batchSize
  );

  const tEmbed0 = performance.now();
  let done = 0;
  for (const batch of batches) {
    const inputs = batch.map((b) => b.text);
    try {
      if (combo.provider === "openai") {
        const { embeddings: vecs, totalTokens } = await embedOpenAiBatch(inputs);
        batch.forEach((b, j) => (embeddings[b.i] = vecs[j]));
        tokens += totalTokens;
      } else {
        const vecs = await embedHfPassages(inputs);
        batch.forEach((b, j) => (embeddings[b.i] = vecs[j]));
      }
    } catch (e) {
      failures += inputs.length;
      errors.push((e as Error).message);
    }
    done += batch.length;
    onProgress({ type: "progress", phase: "embed", done, total: docs.length });
    if (combo.provider === "hf") await sleep(300);
  }
  const embedTimeMs = round(performance.now() - tEmbed0);

  const withEmb = docs
    .map((d, i) => ({ doc: d, emb: embeddings[i] }))
    .filter((x): x is { doc: SeedDoc; emb: number[] } => x.emb !== null);

  if (withEmb.length === 0) {
    throw new Error(
      `Embedding üretilemedi (${combo.provider}). ` + (errors[0] ?? "bilinmeyen hata")
    );
  }

  onProgress({
    type: "progress",
    phase: "store",
    message:
      combo.store === "pgvector"
        ? "Postgres'e yazılıyor + HNSW index kuruluyor"
        : "Pinecone'a upsert ediliyor",
  });

  const tStore0 = performance.now();
  if (combo.store === "pgvector") {
    const table = combo.provider === "openai" ? embeddingsOpenai : embeddingsHf;
    await db.delete(table); // bu provider'ın eski embedding'lerini temizle
    for (const part of chunk(withEmb, 100)) {
      await db.insert(table).values(part.map((x) => ({ documentId: x.doc.id, embedding: x.emb })));
    }
    await createHnswIndex(combo.provider); // DROP + CREATE (timed dahil)
  } else {
    const pc = getPinecone();
    const name = PINECONE_INDEX[combo.provider];
    await pc.createIndex({
      name,
      dimension: EMBED_DIM[combo.provider],
      metric: "cosine",
      spec: { serverless: { cloud: "aws", region: "us-east-1" } },
      waitUntilReady: true,
      suppressConflicts: true,
    });
    const index = pc.index(name);
    const records = withEmb.map((x) => {
      const metadata: RecordMetadata = { documentId: x.doc.id };
      if (x.doc.year != null) metadata.year = x.doc.year;
      if (x.doc.category != null) metadata.category = x.doc.category;
      return { id: String(x.doc.id), values: x.emb, metadata };
    });
    for (const part of chunk(records, 100)) {
      await index.upsert({ records: part });
    }
  }
  const storeTimeMs = round(performance.now() - tStore0);

  const result: IndexResult = {
    comboId: combo.id,
    store: combo.store,
    provider: combo.provider,
    count: withEmb.length,
    failures,
    tokens: combo.provider === "openai" ? tokens : undefined,
    estCostUsd:
      combo.provider === "openai" ? (tokens / 1_000_000) * OPENAI_PRICE_PER_1M_TOKENS : undefined,
    embedTimeMs,
    storeTimeMs,
    totalTimeMs: round(embedTimeMs + storeTimeMs),
    errors,
    indexedAt: new Date().toISOString(),
  };
  persistIndexResult(result); // results/<run>/index-stats.json
  return result;
}

/** documentId -> text (UI preview'i icin). */
export async function getDocTextMap(): Promise<Map<number, string>> {
  const rows = await db.select({ id: documents.id, text: documents.text }).from(documents);
  return new Map(rows.map((r) => [r.id, r.text]));
}

function enrich(hits: { documentId: number; score: number }[], docText: Map<number, string>): EnrichedHit[] {
  return hits.map((h, i) => ({
    rank: i + 1,
    documentId: h.documentId,
    score: h.score,
    textPreview: preview(docText.get(h.documentId)),
  }));
}

/** Tek sorgu, tek kombinasyon. Server-side timing: embed / search / total. */
export async function runSingleSearch(
  query: string,
  combo: Combo,
  docText: Map<number, string>
): Promise<SearchComboResult> {
  try {
    const t0 = performance.now();
    const vec = await embedQuery(combo.provider, query);
    const t1 = performance.now();
    const hits = await runSearch(vec, combo.provider, combo.mode);
    const t2 = performance.now();
    return {
      comboId: combo.id,
      store: combo.store,
      provider: combo.provider,
      embedTime: round(t1 - t0),
      searchTime: round(t2 - t1),
      totalTime: round(t2 - t0),
      top5: enrich(hits, docText),
    };
  } catch (e) {
    // Hata yutulmaz: ham mesaj UI'a döner.
    return { comboId: combo.id, store: combo.store, provider: combo.provider, error: (e as Error).message };
  }
}

/** Tek sorgu, tek kombinasyon — benchmark döngüsü için (warmup bayrağıyla). */
export async function runBenchQuery(
  query: string,
  queryId: string,
  warmup: boolean,
  combo: Combo,
  docText: Map<number, string>
): Promise<BenchRun> {
  const r = await runSingleSearch(query, combo, docText);
  if (r.error) return { queryId, warmup, error: r.error };
  return {
    queryId,
    warmup,
    embedTime: r.embedTime,
    searchTime: r.searchTime,
    totalTime: r.totalTime,
    top5: r.top5,
  };
}

/**
 * Pairwise top-5 örtüşme: her sorgu için iki kombinasyonun top5 documentId
 * kümesinin kesişim boyutu, sorgular üzerinden ortalanır (0..TOP_K).
 */
export function computeOverlap(
  combos: { comboId: string; runs: BenchRun[] }[],
  queryIds: string[]
) {
  const idsFor = (runs: BenchRun[], qid: string): Set<number> =>
    new Set(runs.find((r) => r.queryId === qid && !r.error)?.top5?.map((h) => h.documentId) ?? []);

  const cells = [];
  for (let i = 0; i < combos.length; i++) {
    for (let j = 0; j < combos.length; j++) {
      const a = combos[i];
      const b = combos[j];
      const overlaps = queryIds.map((qid) => {
        const sa = idsFor(a.runs, qid);
        const sb = idsFor(b.runs, qid);
        let inter = 0;
        for (const id of sa) if (sb.has(id)) inter++;
        return inter;
      });
      const nonEmpty = overlaps.filter((_, k) => idsFor(a.runs, queryIds[k]).size > 0);
      const avgOverlap = nonEmpty.length
        ? round(nonEmpty.reduce((x, y) => x + y, 0) / nonEmpty.length)
        : 0;
      cells.push({ a: a.comboId, b: b.comboId, avgOverlap });
    }
  }
  return cells;
}

export { TOP_K };
