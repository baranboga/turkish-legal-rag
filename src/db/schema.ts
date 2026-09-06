import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  vector,
} from "drizzle-orm/pg-core";
import { HF_EMBEDDING_DIM, OPENAI_EMBEDDING_DIM } from "../config";

/**
 * Uc tablo. Embedding'ler iki AYRI tabloda (tek tabloda iki kolon degil):
 * boyutlar farkli (OpenAI 1536, HF 768) ve saglayicilar bagimsiz yasar.
 *
 * Index'ler burada YOK. HNSW index'i Adim 5/6'da olcum sirasinda acikca
 * (timed) CREATE INDEX ile eklenir; bkz. scripts/04-benchmark.ts.
 */

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  text: text("text").notNull(),
  year: integer("year"),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const embeddingsOpenai = pgTable("embeddings_openai", {
  documentId: integer("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  embedding: vector("embedding", { dimensions: OPENAI_EMBEDDING_DIM }).notNull(),
});

export const embeddingsHf = pgTable("embeddings_hf", {
  documentId: integer("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  embedding: vector("embedding", { dimensions: HF_EMBEDDING_DIM }).notNull(),
});

export type DocumentRow = typeof documents.$inferSelect;
export type NewDocumentRow = typeof documents.$inferInsert;
