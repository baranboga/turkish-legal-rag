import type { Mode, Provider } from "../config";

/**
 * 4 kombinasyon: 2 store x 2 provider.
 * Bu modul YALNIZCA tip import eder (config'ten `import type`), bu yuzden hem
 * server route'lari hem client sayfalari guvenle import edebilir.
 * pgvector tarafinda HNSW modu kullanilir (indexleme suresi anlamli olsun diye).
 */
export type Store = "pgvector" | "pinecone";

export interface Combo {
  id: string;
  store: Store;
  provider: Provider;
  mode: Mode;
  label: string;
}

export const COMBOS: Combo[] = [
  { id: "pgvector-openai", store: "pgvector", provider: "openai", mode: "pgvector-hnsw", label: "pgvector + OpenAI" },
  { id: "pgvector-hf", store: "pgvector", provider: "hf", mode: "pgvector-hnsw", label: "pgvector + HF" },
  { id: "pinecone-openai", store: "pinecone", provider: "openai", mode: "pinecone", label: "Pinecone + OpenAI" },
  { id: "pinecone-hf", store: "pinecone", provider: "hf", mode: "pinecone", label: "Pinecone + HF" },
];

export function getCombo(id: string): Combo | undefined {
  return COMBOS.find((c) => c.id === id);
}
