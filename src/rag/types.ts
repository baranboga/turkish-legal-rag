/**
 * RAG tipleri. Yalnizca tip (runtime kod yok) — hem server route'lari hem client
 * sayfalari guvenle import edebilir. Server-only modul import ETMEZ.
 */
import type { RagStrategy } from "../config";

export type { RagStrategy };

/** chunk() ciktisi — tek bir parca + metadata (henuz embed edilmemis). */
export interface Chunk {
  /** kaynak kararin data/rag-raw.json'daki sourceId'si. */
  sourceId: string;
  /** "E.1962/9 K.1962/3" gibi; cikarilamazsa null. */
  kararNo: string | null;
  /** karar tarihi (ISO "YYYY-MM-DD"); cikarilamazsa null. */
  tarih: string | null;
  /** structure-aware'de bolum basligi; fixed'de "—". */
  bolum: string;
  /** karar icindeki chunk sirasi (0-based). */
  chunkIndex: number;
  /** yaklasik token sayisi (karakter / RAG_CHARS_PER_TOKEN). */
  tokenEstimate: number;
  text: string;
}

/** retrieve() tek sonuc: chunk + benzerlik skoru. */
export interface RagHit {
  chunkId: number;
  sourceId: string;
  kararNo: string | null;
  tarih: string | null;
  bolum: string;
  chunkIndex: number;
  /** cosine similarity (0..1). */
  score: number;
  text: string;
}

/** Kaynaklar panelinde gosterilen sonuc (1-based atif numarasiyla). */
export interface RagSource extends RagHit {
  /** [1], [2] ... atif numarasi (= rank). */
  n: number;
}

export interface RetrievalTiming {
  embedMs: number;
  searchMs: number;
  totalMs: number;
  /** sorgu embedding'i icin harcanan token. */
  queryTokens: number;
  queryCostUsd: number;
}

export interface GenerationTiming {
  ms: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

/** Debug paneli icin modele gonderilen tam prompt. */
export interface PromptDebug {
  system: string;
  user: string;
}

// --- /api/rag/chat (NDJSON stream) ---
export type ChatEvent =
  | {
      type: "meta";
      model: string;
      strategy: RagStrategy;
      topK: number;
      sources: RagSource[];
      retrieval: RetrievalTiming;
      prompt: PromptDebug;
    }
  | { type: "token"; text: string }
  | { type: "done"; generation: GenerationTiming; totalCostUsd: number }
  | { type: "error"; message: string };

// --- /api/rag/ingest (NDJSON stream) ---
export type RagIngestEvent =
  | { type: "progress"; phase: "chunk" | "embed" | "store"; done?: number; total?: number; message?: string }
  | { type: "result"; result: RagIngestResult }
  | { type: "error"; message: string };

export interface RagIngestResult {
  strategy: RagStrategy;
  table: string;
  documents: number;
  chunks: number;
  avgChunksPerDoc: number;
  withKararNo: number;
  failures: number;
  tokens: number;
  estCostUsd: number;
  chunkMs: number;
  embedMs: number;
  storeMs: number;
  totalMs: number;
  errors: string[];
  indexedAt: string;
}
