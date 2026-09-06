-- HNSW index DDL (referans).
-- Bu index'ler drizzle-kit journal'ina DAHIL DEGILDIR; kasitli olarak
-- benchmark script'i (scripts/04-benchmark.ts) tarafindan explicit + TIMED
-- olarak (DROP + CREATE) uygulanir. Sebep:
--   1) index build suresini olcmek (migration timing vermez),
--   2) drizzle-kit push'un HNSW'de operator class'i dusurme bug'indan kacinmak.
-- Manuel uygulamak istersen (opsiyonel):

CREATE INDEX IF NOT EXISTS embeddings_openai_embedding_hnsw
  ON embeddings_openai USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS embeddings_hf_embedding_hnsw
  ON embeddings_hf USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
