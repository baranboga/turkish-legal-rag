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

// ---------------------------------------------------------------------------
// RAG (Hafta 7-8) — naive pipeline: chunk -> embed -> retrieve -> prompt -> generate
// ---------------------------------------------------------------------------
//
// KARARLAR (Baran):
//   - Vector store: pgvector (Supabase). Tek datastore; chunk metni + metadata +
//     vektor tek tabloda, tek sorgu skorla birlikte hepsini doner. Iki chunking
//     stratejisi = iki AYRI tablo (mevcut "embeddings iki tabloda" konvansiyonu).
//   - Embedding: OpenAI text-embedding-3-small (yukaridaki OPENAI_* ile ayni;
//     benchmark ile ayni saglayici, token/maliyet raporlamasi kolay).
//   - Generation: OpenAI chat (streaming). Framework (LangChain/LlamaIndex) YOK;
//     her adim ayri okunabilir fonksiyon. API key'ler yalnizca server tarafinda.

/** Cevap ureten chat modeli. .env icinden override edilebilir. */
export const RAG_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || "gpt-4o-mini";

/**
 * Chat modeli fiyatlari (USD / 1M token). Resmi OpenAI fiyatlari (model
 * degisirse guncelle). Bilinmeyen model icin gpt-4o-mini oranina duser.
 */
export const CHAT_PRICE_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
};
export function chatPrice(model: string): { input: number; output: number } {
  return CHAT_PRICE_PER_1M[model] ?? CHAT_PRICE_PER_1M["gpt-4o-mini"];
}

/**
 * Chunking parametreleri.
 *   - FIXED: ~500 token pencere, 50 token overlap (kayan pencere).
 *   - Token sayaci olarak gercek tokenizer yerine karakter yaklasikligi
 *     kullaniyoruz (naive; ek bagimlilik yok). Turkce o200k tokenizer'da
 *     ~1 token ≈ 3 karakter. Chunk boyutu kritik hassasiyet gerektirmez;
 *     maliyet/token RAPORLAMASI ise API'nin GERCEK usage'ini kullanir.
 */
export const RAG_CHARS_PER_TOKEN = 3;
export const FIXED_CHUNK_TOKENS = 500;
export const FIXED_CHUNK_OVERLAP_TOKENS = 50;
/** structure-aware: bir bolum bu token esigini asarsa icinde fixed-size'a duser. */
export const STRUCTURE_MAX_SECTION_TOKENS = 500;

/** Retrieval varsayilan top-k (UI'dan override edilebilir). */
export const RAG_TOP_K_DEFAULT = 5;
export const RAG_TOP_K_MAX = 20;

/**
 * RAG kendi veri dosyasini kullanir: data/rag-raw.json (npm run rag:fetch).
 * Neden ayri: benchmark'in raw.json'u ortak baslik KIRPILMIS + 2000 karaktere
 * kesilmis; bu yuzden (a) kararlarin ~%64'unde "Esas/Karar No" basligi silinmis
 * (karar no metadata'si cikmaz) ve (b) 2000 karakter ~tek chunk kalir. RAG icin
 * ayni 400 karari (ayni deterministik sampling) HAM + daha uzun metinle cekeriz.
 */
export const RAG_DATA_FILE = "data/rag-raw.json";
/** rag-fetch: dokuman basina alinacak azami karakter (embedding maliyetini sinirlar). */
export const RAG_TEXT_MAX_CHARS = 16000;

/** Iki strateji = iki pgvector tablosu. */
export const RAG_STRATEGIES = ["fixed", "structure"] as const;
export type RagStrategy = (typeof RAG_STRATEGIES)[number];
export const RAG_CHUNK_TABLE: Record<RagStrategy, string> = {
  fixed: "rag_chunks_fixed",
  structure: "rag_chunks_structure",
};
