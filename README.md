# turkish-legal-rag

Türkçe hukuk metinleri üzerinde **vector store karşılaştırma** altyapısı (Hafta 5-6).
pgvector (exact + HNSW) ile Pinecone'u, OpenAI ile açık kaynak (HF) embedding'lerle
yan yana ölçer. İleriki haftalarda RAG (chunking, hybrid search, reranking,
generation), eval suite ve deploy/monitoring aynı repoya eklenecek şekilde kuruldu.

- **Stack:** Next.js 15 (App Router), TypeScript, Node 20+
- **Altyapı (hepsi bulutta, local Docker yok):** Supabase (Postgres + pgvector),
  Pinecone, OpenAI API, Hugging Face Inference API
- **Tüm API key'ler yalnızca server-side.** Hiçbir değişken `NEXT_PUBLIC_` almaz;
  UI DB'ye/servise bağlanmaz, sadece `results/` altındaki dosyaları okur.

---

## Klasör yapısı

```
data/
  queries.json          # 10 DONDURULMUS Turkce sorgu (versiyonlanir)
  raw.json              # 400 kayit (npm run fetch ile uretilir; gitignore)
drizzle/
  0000_*.sql            # tablo migration'i (+ CREATE EXTENSION vector)
  hnsw-indexes.sql      # HNSW DDL referansi (benchmark tarafindan timed uygulanir)
scripts/
  00-verify-db.ts       # pgvector surumu + HNSW destegi dogrulamasi
  01-fetch-data.ts      # veri cekme
  02-embed.ts           # OpenAI + HF embedding -> Postgres
  03-pinecone-setup.ts  # iki index olustur + upsert
  04-benchmark.ts       # olcum harness'i (HNSW index'i burada timed olusturulur)
  05-sync-test.ts       # sync davranisi testi
src/
  config.ts             # CURRENT_RUN + model/boyut/parametreler (tek kaynak)
  db/{schema,client}.ts # Drizzle sema + postgres-js client (pooler: prepare:false)
  embeddings/{openai,hf}.ts
  search/{index,pgvector,pinecone}.ts   # search(queryText, provider, mode, filter?)
  report.ts             # benchmark.md uretici
  results.ts            # UI icin results/ okuyucu
  app/{compare,metrics}/ # UI sayfalari
results/<run>/          # uretilen ciktilar (bkz. results/README.md)
```

---

## Kurulum

### 1) Bağımlılıklar

```powershell
npm install
```

### 2) Ortam değişkenleri

`.env.example` dosyasını `.env` olarak kopyala ve doldur:

```powershell
Copy-Item .env.example .env
```

| Değişken | Açıklama |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI embedding (`text-embedding-3-small`) |
| `HF_TOKEN` | Hugging Face Inference API token |
| `HF_EMBEDDING_MODEL` | `intfloat/multilingual-e5-base` (default) |
| `HF_EMBEDDING_DIM` | `768` (e5-base) |
| `PINECONE_API_KEY` | Pinecone |
| `PINECONE_INDEX_OPENAI` | `turkish-legal-rag-openai-1536` |
| `PINECONE_INDEX_HF` | `turkish-legal-rag-hf` |
| `DIRECT_URL` | Supabase **direct** bağlantı (port **5432**) — migration için |
| `DATABASE_URL` | Supabase **pooler** bağlantı (port **6543**) — uygulama sorguları için |

> **⚠️ Pooler uyarısı:** `6543` transaction pooler'dır ve prepared statement
> desteklemez. `src/db/client.ts` bu bağlantıyı `prepare: false` ile kurar.
> Migration'lar `DIRECT_URL` (5432) üzerinden çalışır. Bu ikisini karıştırırsan
> migration sessizce/anlaşılmaz hatayla patlar.

---

## Çalıştırma sırası

`.env` dolduruldiktan sonra sırayla:

```powershell
npm run verify:db     # (dogrulama) pgvector surumu + HNSW destegi raporu
npm run fetch         # data/raw.json  (public dataset, key gerekmez)
npm run db:migrate    # tablolari olustur (DIRECT_URL / 5432)
npm run embed         # OpenAI + HF embedding -> Postgres  (+ embed-stats.json)
npm run pinecone      # iki Pinecone index + upsert         (+ pinecone-stats.json)
npm run benchmark     # results/<run>/benchmark.json + benchmark.md
npm run sync-test     # results/<run>/sync-test.md
```

Ardından UI:

```powershell
npm run dev
# http://localhost:3000/compare  ve  /metrics
```

> `db:migrate` çalışmadan `db:generate` gerekmiyor — migration zaten üretildi
> (`drizzle/0000_*.sql`). HF modelini/boyutunu değiştirirsen (örn. fallback 384),
> önce `.env` içindeki `HF_EMBEDDING_DIM`'i güncelle, `drizzle/0000_*.sql` + `meta/`
> içeriğini sil, `npm run db:generate` ile yeniden üret, sonra `db:migrate`.

---

## Doğrulama notları (kurulum sırasında teyit edildi)

1. **Drizzle vector/HNSW API:** `vector("embedding", { dimensions })` +
   `USING hnsw (embedding vector_cosine_ops)`. HNSW index'i `drizzle-kit push`
   operator-class'ı düşürebildiği ve build süresini ölçmek istediğimiz için
   benchmark script'inde **explicit + timed** `CREATE INDEX` ile kuruluyor
   (referans DDL: `drizzle/hnsw-indexes.sql`).
2. **pgvector / Supabase:** `npm run verify:db` ile ölç (extversion + HNSW am).
   Supabase güncel pgvector 0.7+ ile HNSW destekler; script kesin sürümü raporlar.
3. **HF modeli:** `intfloat/multilingual-e5-base` — **768 boyut**,
   `query:` / `passage:` prefix'leri zorunlu (E5). hf-inference router'da
   `feature-extraction` route'u serve ediliyor (token'sız 401, yani route var).
   Fallback: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384,
   prefix kullanmaz — kod model adında "e5" yoksa prefix'i otomatik kapatır).
4. **Dataset kolonları** (`aym_norm`): `id`→`sourceId`, `text`, `year` (int),
   `court`→`category` (null olduğunda `source`'a düşer; bu alt kümede hep `aym_norm`),
   `karar_tarihi`→`date`.

---

## Ölçüm ayrıntıları

- **10 sorgu DONDURULMUŞ.** `data/queries.json` içindeki 10 sorgunun `id`/`text`'i
  asla değişmez (haftalar arası karşılaştırılabilirlik için). Yeni sorgu eklenebilir.
  5 lexical (terim eşleşen) + 5 semantic (yalnızca anlamca eşleşen).
- **Latency** yalnızca vektör deposunu ölçer; sorgu-embedding süresi **hariç**
  (provider başına bir kez hesaplanıp cache'lenir → pgvector vs Pinecone adil).
- **recall@5** ground truth = **aynı provider'ın** `pgvector-exact` top5'i
  (provider bazında ayrı; OpenAI ground truth'u HF ile karşılaştırılmaz).
- **exact modu** HNSW index var olsa bile `SET LOCAL enable_indexscan = off` ile
  brute-force kalır (ground truth); **hnsw modu** index + `hnsw.ef_search`.
- **Filtreli koşu:** `q02, q05, q08` sorguları `{ yearGte: 2019 }` ile de koşulur;
  dönen sonuç sayısı da kaydedilir (400 kayıttan ~100'ü ≥2019).
- **Örnekleme:** `aym_norm` kronolojik sıralı olduğundan, yıl çeşitliliği için
  400 kayıt dataset boyunca 4 pencereden (stratified) çekilir (1962–2026).
- **Sync testi:** `documents`'tan 5 kayıt silinir; FK `on delete cascade`
  pgvector embedding'lerini otomatik siler, Pinecone'a **dokunulmaz** (varsayılan
  davranış ölçülür, ek temizlik kodu yok).

---

## Notlar

- `results/*.md` dosyalarında yorum yok — yalnızca tablo ve ham sayı. Yorum sana ait.
- İleriki haftalar için: yeni bir ölçüm setinde `src/config.ts` içindeki
  `CURRENT_RUN` değerini değiştir; script'ler ve UI otomatik yeni klasörü kullanır.
