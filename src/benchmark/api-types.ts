/**
 * API request/response tipleri. Sadece tip (runtime kod yok) — hem server
 * route'lari hem client sayfalari import eder. Server-only modul import ETMEZ.
 */
import type { Store } from "./combos";

export interface EnrichedHit {
  rank: number;
  documentId: number;
  score: number;
  textPreview: string;
}

// --- /api/index (NDJSON stream) ---
export type IndexEvent =
  | { type: "progress"; phase: "seed" | "embed" | "store"; done?: number; total?: number; message?: string }
  | { type: "result"; result: IndexResult }
  | { type: "error"; message: string };

export interface IndexResult {
  comboId: string;
  store: Store;
  provider: string;
  count: number;
  failures: number;
  tokens?: number;
  estCostUsd?: number;
  embedTimeMs: number;
  storeTimeMs: number;
  totalTimeMs: number;
  errors: string[];
  indexedAt?: string;
}

// --- /api/document ---
export interface DocumentDetail {
  id: number;
  sourceId: string;
  text: string;
  year: number | null;
  category: string | null;
}

// --- /api/search ---
export interface SearchComboResult {
  comboId: string;
  store: Store;
  provider: string;
  embedTime?: number;
  searchTime?: number;
  totalTime?: number;
  top5?: EnrichedHit[];
  error?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchComboResult[];
}

// --- /api/benchmark ---
export interface BenchRun {
  queryId: string;
  warmup: boolean;
  embedTime?: number;
  searchTime?: number;
  totalTime?: number;
  top5?: EnrichedHit[];
  error?: string;
}

export interface BenchComboStats {
  comboId: string;
  store: Store;
  provider: string;
  total: { p50: number; p95: number; avg: number };
  search: { p50: number; p95: number; avg: number };
  embedAvg: number;
  measuredCount: number;
  warmupCount: number;
  errors: string[];
  runs: BenchRun[];
}

export interface OverlapCell {
  a: string;
  b: string;
  avgOverlap: number;
}

export interface BenchmarkResponse {
  generatedAt: string;
  queries: { id: string; type: string; text: string }[];
  combos: BenchComboStats[];
  overlap: OverlapCell[];
}

// --- /api/benchmark (NDJSON stream) ---
export type BenchmarkEvent =
  | { type: "phase"; message: string }
  | { type: "progress"; scope: "embed" | "search"; label: string; done: number; total: number }
  | { type: "result"; data: BenchmarkResponse }
  | { type: "error"; message: string };
