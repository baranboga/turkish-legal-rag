import type { Mode, Provider } from "./config";

/** data/raw.json icindeki her kayit. */
export interface RawRecord {
  sourceId: string;
  text: string;
  year: number | null;
  category: string;
  date: string | null;
  month: number | null;
}

/** data/queries.json icindeki dondurulmus sorgu. */
export interface Query {
  id: string;
  type: "lexical" | "semantic";
  text: string;
}

/** search() cikti tipi. */
export interface SearchHit {
  documentId: number;
  score: number;
}

export interface SearchFilter {
  yearGte?: number;
  category?: string;
}

// ---------------------------------------------------------------------------
// results/<run>/benchmark.json sema tipleri (script yazar, UI okur)
// ---------------------------------------------------------------------------

export interface LatencyStats {
  p50: number;
  p95: number;
}

/** UI'da gosterilecek zenginlestirilmis sonuc (benchmark tarafinda text eklenir). */
export interface EnrichedHit {
  rank: number;
  documentId: number;
  score: number;
  textPreview: string;
}

export interface ComboResult {
  provider: Provider;
  mode: Mode;
  latency: LatencyStats;
  /** exact icin null (kendisi ground truth); hnsw/pinecone icin 0..1. */
  recallAt5: number | null;
  top5: EnrichedHit[];
}

export interface FilteredComboResult {
  provider: Provider;
  mode: Mode;
  latency: LatencyStats;
  count: number;
  top5: EnrichedHit[];
}

export interface PerQueryResult {
  queryId: string;
  text: string;
  type: "lexical" | "semantic";
  /** anahtar: "provider:mode". */
  combos: Record<string, ComboResult>;
  /** ayni sorgu icin openai-exact vs hf-exact top5 kesisim sayisi (0..5). */
  crossProviderExactOverlap: number;
  /** yalnizca FILTERED_QUERY_IDS icin dolu. anahtar: "provider:mode". */
  filtered?: Record<string, FilteredComboResult>;
}

export interface EmbedProviderStats {
  totalMs: number;
  failures: number;
  count: number;
  totalTokens?: number;
  estCostUsd?: number;
}

export interface BenchmarkFile {
  run: string;
  generatedAt: string;
  config: {
    topK: number;
    runsPerCombo: number;
    openaiModel: string;
    openaiDim: number;
    hfModel: string;
    hfDim: number;
    pineconeIndexOpenai: string;
    pineconeIndexHf: string;
    hnswEfSearch: number;
    filteredQueryIds: string[];
    filterYearGte: number;
  };
  embedStats: Record<Provider, EmbedProviderStats>;
  indexBuildMs: Record<Provider, number>;
  pineconeUpsertMs: Record<Provider, number>;
  /** kombinasyon bazli ozet (tum sorgu x kosu). anahtar: "provider:mode". */
  comboSummary: Record<
    string,
    { provider: Provider; mode: Mode; latency: LatencyStats; recallAt5Avg: number | null }
  >;
  perQuery: PerQueryResult[];
}
