import type { Mode, Provider } from "../config";
import { embedHfQuery } from "../embeddings/hf";
import { embedOpenAiQuery } from "../embeddings/openai";
import type { SearchFilter, SearchHit } from "../types";
import { pgvectorSearch } from "./pgvector";
import { pineconeSearch } from "./pinecone";

/** Sorgu embedding'i (HF tarafinda "query: " prefix'i otomatik uygulanir). */
export function embedQuery(provider: Provider, text: string): Promise<number[]> {
  return provider === "openai" ? embedOpenAiQuery(text) : embedHfQuery(text);
}

/**
 * Onceden hesaplanmis vektorle arama. Benchmark bunu kullanir: latency
 * yalnizca vektor deposunu olcer, sorgu-embedding suresini DISLAR (o Adim 3'te
 * ayri olculur). Boylece pgvector vs Pinecone karsilastirmasi adil olur.
 */
export function runSearch(
  vector: number[],
  provider: Provider,
  mode: Mode,
  filter?: SearchFilter
): Promise<SearchHit[]> {
  if (mode === "pinecone") return pineconeSearch(vector, provider, filter);
  return pgvectorSearch(vector, provider, mode, filter);
}

/**
 * Istenen tek arayuz: search(queryText, provider, mode, filter?) -> SearchHit[]
 * Sorgu metnini embed eder, sonra ilgili modda arar.
 */
export async function search(
  queryText: string,
  provider: Provider,
  mode: Mode,
  filter?: SearchFilter
): Promise<SearchHit[]> {
  const vector = await embedQuery(provider, queryText);
  return runSearch(vector, provider, mode, filter);
}

export { createHnswIndex, dropHnswIndex } from "./pgvector";
