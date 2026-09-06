import { PINECONE_INDEX, TOP_K, type Provider } from "../config";
import { getPinecone } from "../pinecone";
import type { SearchFilter, SearchHit } from "../types";

function buildFilter(filter?: SearchFilter): Record<string, unknown> | undefined {
  if (!filter) return undefined;
  const f: Record<string, unknown> = {};
  if (filter.yearGte != null) f.year = { $gte: filter.yearGte };
  if (filter.category != null) f.category = { $eq: filter.category };
  return Object.keys(f).length ? f : undefined;
}

/** Pinecone cosine arama. Filtre metadata filter olarak uygulanir. Top-5 doner. */
export async function pineconeSearch(
  vector: number[],
  provider: Provider,
  filter?: SearchFilter
): Promise<SearchHit[]> {
  const index = getPinecone().index(PINECONE_INDEX[provider]);
  const pineFilter = buildFilter(filter);
  const res = await index.query({
    vector,
    topK: TOP_K,
    includeMetadata: true,
    includeValues: false,
    ...(pineFilter ? { filter: pineFilter } : {}),
  });
  return (res.matches ?? []).map((m) => ({
    documentId: Number(m.metadata?.documentId ?? m.id),
    score: m.score ?? 0,
  }));
}
