/**
 * Merkezi konfigurasyon. Hem script'ler hem UI bunu okur.
 *
 * CURRENT_RUN degistiginde tum yollar (results/<run>/...) otomatik degisir.
 * Ilerideki haftalarda ikinci/ucuncu sonuc seti icin sadece bu degeri degistir;
 * eski sonuclar results/ altinda yan yana durmaya devam eder.
 */

export const CURRENT_RUN = "week-05-06";

/** Her sorguda kac sonuc dondurulecek. */
export const TOP_K = 5;

// ---------------------------------------------------------------------------
// Embedding saglayicilari
// ---------------------------------------------------------------------------

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIM = 1536;
/** text-embedding-3-small resmi fiyati: 0.02 USD / 1M token. */
export const OPENAI_PRICE_PER_1M_TOKENS = 0.02;

/**
 * HF modeli: dogrulama adiminda feature-extraction icin hf-inference router
 * uzerinde serve edildigi teyit edildi (intfloat/multilingual-e5-base, 768 boyut).
 * E5 ailesi oldugu icin dokuman ve sorgulara prefix eklenmesi zorunlu.
 * .env icinden override edilebilir; default asagida.
 */
export const HF_EMBEDDING_MODEL =
  process.env.HF_EMBEDDING_MODEL?.trim() || "intfloat/multilingual-e5-base";
export const HF_EMBEDDING_DIM = Number(process.env.HF_EMBEDDING_DIM?.trim() || 768);
/**
 * E5 prefix'leri (bkz. model karti FAQ): sorgu ve dokuman tarafinda AYNI
 * sekilde uygulanmali. E5 disi modeller (orn. MiniLM fallback) prefix
 * kullanmaz; bu yuzden prefix yalnizca model adinda "e5" gecerse uygulanir.
 */
export const HF_USES_E5_PREFIX = /e5/i.test(HF_EMBEDDING_MODEL);
export const HF_QUERY_PREFIX = HF_USES_E5_PREFIX ? "query: " : "";
export const HF_PASSAGE_PREFIX = HF_USES_E5_PREFIX ? "passage: " : "";

// ---------------------------------------------------------------------------
// pgvector / HNSW
// ---------------------------------------------------------------------------

export const HNSW_M = 16;
export const HNSW_EF_CONSTRUCTION = 64;
export const HNSW_EF_SEARCH = 40;

// ---------------------------------------------------------------------------
// Pinecone
// ---------------------------------------------------------------------------

export const PINECONE_INDEX_OPENAI =
  process.env.PINECONE_INDEX_OPENAI?.trim() || "turkish-legal-rag-openai-1536";
export const PINECONE_INDEX_HF =
  process.env.PINECONE_INDEX_HF?.trim() || "turkish-legal-rag-hf";

// ---------------------------------------------------------------------------
// Veri kaynagi
// ---------------------------------------------------------------------------

export const DATASET = {
  name: "hamzabagirsakci/turkish-court-decisions",
  config: "aym_norm",
  split: "train",
  limit: 400,
  /** Bu hafta chunking YOK: her kararin ilk 2000 karakteri alinir. */
  textMaxChars: 2000,
} as const;

// ---------------------------------------------------------------------------
// Benchmark parametreleri
// ---------------------------------------------------------------------------

export const PROVIDERS = ["openai", "hf"] as const;
export const MODES = ["pgvector-exact", "pgvector-hnsw", "pinecone"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type Mode = (typeof MODES)[number];

/** Her (provider, mode) kombinasyonu kac kez kosulacak. */
export const RUNS_PER_COMBO = 3;

/** 10 dondurulmus sorgudan filtreli olarak da kosulacak 3 tanesinin id'leri. */
export const FILTERED_QUERY_IDS = ["q02", "q05", "q08"] as const;
export const FILTER_YEAR_GTE = 2019;

export function comboKey(provider: Provider, mode: Mode): string {
  return `${provider}:${mode}`;
}

/** results/<CURRENT_RUN> — sabit yazma, hep buradan oku. */
export function resultsDir(): string {
  return `results/${CURRENT_RUN}`;
}

export const EMBED_DIM: Record<Provider, number> = {
  openai: OPENAI_EMBEDDING_DIM,
  hf: HF_EMBEDDING_DIM,
};

export const PINECONE_INDEX: Record<Provider, string> = {
  openai: PINECONE_INDEX_OPENAI,
  hf: PINECONE_INDEX_HF,
};
