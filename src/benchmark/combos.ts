import type { Mode, Provider } from "../config";

/**
 * Iki kavram AYRI tutulur:
 *   - INDEX_TARGETS: indexleme hedefi = (store, provider). pgvector tarafinda
 *     exact ve HNSW AYNI embedding tablosunu paylasir; bu yuzden indexleme
 *     store×provider basina BIR kez yapilir → 4 hedef. /index sayfasi bunlari
 *     kullanir (exact'i ayrica indexlemek anlamsiz olurdu).
 *   - COMBOS: arama/benchmark kombinasyonu = (store, provider, mode). pgvector
 *     exact (brute-force; ground truth) ile HNSW AYRI olculur → 6 kombinasyon.
 *     Boylece 1000ms'lik surenin index'ten mi baglantidan mi geldigi, exact ve
 *     HNSW yan yana gorulerek ayirt edilebilir.
 *
 * Bu modul YALNIZCA tip import eder (config'ten `import type`), bu yuzden hem
 * server route'lari hem client sayfalari guvenle import edebilir.
 */
export type Store = "pgvector" | "pinecone";

export interface IndexTarget {
  id: string;
  store: Store;
  provider: Provider;
  label: string;
}

/** Indexleme hedefleri (store × provider) — 4. */
export const INDEX_TARGETS: IndexTarget[] = [
  { id: "pgvector-openai", store: "pgvector", provider: "openai", label: "pgvector + OpenAI" },
  { id: "pgvector-hf", store: "pgvector", provider: "hf", label: "pgvector + HF" },
  { id: "pinecone-openai", store: "pinecone", provider: "openai", label: "Pinecone + OpenAI" },
  { id: "pinecone-hf", store: "pinecone", provider: "hf", label: "Pinecone + HF" },
];

export interface Combo {
  id: string;
  store: Store;
  provider: Provider;
  mode: Mode;
  label: string;
}

/** Arama/benchmark kombinasyonlari (store × provider × mode) — 6. */
export const COMBOS: Combo[] = [
  { id: "pgvector-exact-openai", store: "pgvector", provider: "openai", mode: "pgvector-exact", label: "pgvector exact + OpenAI" },
  { id: "pgvector-hnsw-openai", store: "pgvector", provider: "openai", mode: "pgvector-hnsw", label: "pgvector HNSW + OpenAI" },
  { id: "pinecone-openai", store: "pinecone", provider: "openai", mode: "pinecone", label: "Pinecone + OpenAI" },
  { id: "pgvector-exact-hf", store: "pgvector", provider: "hf", mode: "pgvector-exact", label: "pgvector exact + HF" },
  { id: "pgvector-hnsw-hf", store: "pgvector", provider: "hf", mode: "pgvector-hnsw", label: "pgvector HNSW + HF" },
  { id: "pinecone-hf", store: "pinecone", provider: "hf", mode: "pinecone", label: "Pinecone + HF" },
];

export function getCombo(id: string): Combo | undefined {
  return COMBOS.find((c) => c.id === id);
}

export function getIndexTarget(id: string): IndexTarget | undefined {
  return INDEX_TARGETS.find((t) => t.id === id);
}
