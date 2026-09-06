import { sql, type SQL } from "drizzle-orm";
import {
  HNSW_EF_CONSTRUCTION,
  HNSW_EF_SEARCH,
  HNSW_M,
  TOP_K,
  type Provider,
} from "../config";
import { db } from "../db/client";
import type { SearchFilter, SearchHit } from "../types";

function tableFor(provider: Provider): string {
  return provider === "openai" ? "embeddings_openai" : "embeddings_hf";
}

function hnswIndexName(provider: Provider): string {
  return `${tableFor(provider)}_embedding_hnsw`;
}

/**
 * pgvector cosine arama.
 *   - "pgvector-exact": SET LOCAL enable_indexscan/bitmapscan = off => HNSW
 *     index olsa bile brute-force (ground truth) tarama.
 *   - "pgvector-hnsw": HNSW index + SET LOCAL hnsw.ef_search.
 * Skor = 1 - cosine_distance (yani cosine similarity). Top-5 doner.
 */
export async function pgvectorSearch(
  vector: number[],
  provider: Provider,
  mode: "pgvector-exact" | "pgvector-hnsw",
  filter?: SearchFilter
): Promise<SearchHit[]> {
  const table = sql.raw(tableFor(provider));
  const vec = `[${vector.join(",")}]`;

  const needsJoin = !!filter && (filter.yearGte != null || filter.category != null);
  const where: SQL[] = [];
  if (filter?.yearGte != null) where.push(sql`d.year >= ${filter.yearGte}`);
  if (filter?.category != null) where.push(sql`d.category = ${filter.category}`);
  const joinSql = needsJoin ? sql` JOIN documents d ON d.id = e.document_id` : sql``;
  const whereSql = where.length ? sql` WHERE ${sql.join(where, sql` AND `)}` : sql``;

  const query = sql`
    SELECT e.document_id AS "documentId", 1 - (e.embedding <=> ${vec}::vector) AS score
    FROM ${table} e${joinSql}${whereSql}
    ORDER BY e.embedding <=> ${vec}::vector
    LIMIT ${TOP_K}
  `;

  return db.transaction(async (tx) => {
    if (mode === "pgvector-exact") {
      await tx.execute(sql.raw("SET LOCAL enable_indexscan = off"));
      await tx.execute(sql.raw("SET LOCAL enable_bitmapscan = off"));
    } else {
      await tx.execute(sql.raw(`SET LOCAL hnsw.ef_search = ${Number(HNSW_EF_SEARCH)}`));
    }
    const rows = (await tx.execute(query)) as unknown as {
      documentId: number | string;
      score: number | string;
    }[];
    return rows.map((r) => ({
      documentId: Number(r.documentId),
      score: Number(r.score),
    }));
  });
}

/**
 * HNSW index'i (yeniden) olusturur ve kurulum suresini (ms) doner.
 * Explicit SQL kullaniyoruz: (1) build suresini olcebilmek, (2) drizzle-kit
 * push'un HNSW'de operator class'i dusurme bug'indan kacinmak icin.
 * DDL karsiligi: drizzle/hnsw-indexes.sql
 */
export async function createHnswIndex(provider: Provider): Promise<number> {
  const table = tableFor(provider);
  const idx = hnswIndexName(provider);
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${idx}`));
  const start = performance.now();
  await db.execute(
    sql.raw(
      `CREATE INDEX ${idx} ON ${table} USING hnsw (embedding vector_cosine_ops) ` +
        `WITH (m = ${Number(HNSW_M)}, ef_construction = ${Number(HNSW_EF_CONSTRUCTION)})`
    )
  );
  return Math.round(performance.now() - start);
}

export async function dropHnswIndex(provider: Provider): Promise<void> {
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${hnswIndexName(provider)}`));
}
