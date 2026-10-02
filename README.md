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
  01-fetch-data.ts      # veri cekme (benchmark; baslik kirpilir, 2000 char)
  02-embed.ts           # OpenAI + HF embedding -> Postgres
  03-pinecone-setup.ts  # iki index olustur + upsert
  04-benchmark.ts       # olcum harness'i (HNSW index'i burada timed olusturulur)
  05-sync-test.ts       # sync davranisi testi
  06-rag-fetch.ts       # RAG ham verisi (baslik KIRPILMAZ, uzun metin) -> rag-raw.json
  07-rag-ingest.ts      # chunk + embed + pgvector (iki strateji) + HNSW
src/
  config.ts             # CURRENT_RUN + model/boyut/parametreler + RAG ayarlari (tek kaynak)
  db/{schema,client}.ts # Drizzle sema + postgres-js client (pooler: prepare:false)
  embeddings/{openai,hf}.ts
  search/{index,pgvector,pinecone}.ts   # search(queryText, provider, mode, filter?)
  rag/                  # NAIVE RAG pipeline (Hafta 7-8) — asagiya bak
    chunk.ts            # chunkFixed() + chunkStructure() (saf)
    metadata.ts         # parseKararNo() + resolveTarih() (saf)
    prompt.ts           # buildPrompt() (saf)
    retrieve.ts         # retrieve(query, strategy, topK) -> hits + skor + latency
    generate.ts         # streamGenerate() — OpenAI chat streaming + token/maliyet
    ingest.ts           # chunk->embed->pgvector + HNSW (route + CLI paylasir)
    types.ts            # paylasilan tipler (client+server guvenli)
  report.ts             # benchmark.md uretici
  results.ts            # UI icin results/ okuyucu
  app/{compare,metrics}/ # statik UI sayfalari
  app/{indexer,search,benchmark}/ # canli benchmark UI
  app/chat/             # NAIVE RAG sohbet UI (/chat)
  app/api/rag/{chat,ingest}/ # RAG route'lari (NDJSON stream)
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

## RAG — naive pipeline (Hafta 7-8)

Vektör store karşılaştırmasının **üstüne** kurulan, kasıtlı olarak **naive** bir
RAG hattı. Hybrid search ve reranking **Hafta 8'e** bırakıldı; bu adımda amaç
uçtan uca çalışan, okunabilir ve ölçülebilir bir temel.

### Mimari — her adım ayrı, okunabilir bir fonksiyon

```
chunk()  ->  embed()  ->  retrieve()  ->  buildPrompt()  ->  generate()
 (saf)      (OpenAI)      (pgvector)        (saf)          (OpenAI stream)
```

- **Vektör store:** **pgvector (Supabase)**. Tek datastore; chunk metni +
  metadata + vektör **aynı tabloda**, tek sorgu skorla birlikte hepsini döner.
  İki chunking stratejisi = iki **ayrı tablo** (`rag_chunks_fixed`,
  `rag_chunks_structure`) — repodaki "embedding'ler iki ayrı tabloda"
  konvansiyonunun aynısı.
- **Embedding:** OpenAI `text-embedding-3-small` (1536) — generation ile aynı
  sağlayıcı, token/maliyet raporlaması kolay.
- **Generation:** OpenAI chat (`OPENAI_CHAT_MODEL`, default `gpt-4o-mini`),
  **streaming**. API key'ler **yalnızca server tarafında** (route handler); UI
  hiçbir key görmez, yalnızca `/api/rag/*` ile konuşur.

### Neden framework (LangChain / LlamaIndex) kullanmadık?

Bilinçli bir karar — bu bir **öğrenme/benchmark** reposu:

1. **Şeffaflık.** RAG'ın gerçekte ne yaptığını (chunk sınırları, prompt'un tam
   hali, retrieval skorları, token sayıları) adım adım görmek istiyoruz. Framework
   bu adımları soyutlayıp gizler; burada her adım açıkça okunabilir tek bir
   fonksiyon (`src/rag/*`) ve `/chat` debug panelinde modele giden **tam prompt**
   görünür.
2. **Tam kontrol + daha az bağımlılık.** Chunking stratejisi, prompt kuralları,
   streaming ve maliyet ölçümü bize ait; sürüm kırılmaları / "sihirli" default'lar
   yok. Zaten elimizde çıplak **OpenAI SDK** ve **Supabase/postgres-js** client'ları
   var — araya bir katman koymanın net faydası yok.
3. **Ölçülebilirlik.** Retrieval ve generation latency'sini **ayrı**, token ve
   maliyeti **gerçek** `usage`'dan ölçüyoruz; framework'ün kendi çağrı katmanı bu
   ölçümleri bulanıklaştırırdı.
4. **Büyümeye hazır.** Hafta 8'de hybrid search + reranking'i bu açık hatta
   doğrudan ekleyeceğiz; soyutlamayı önce öğrenip sonra (gerekirse) seçmek daha
   sağlıklı.

### Çalıştırma

`.env` dolu (en az `OPENAI_API_KEY` + `DATABASE_URL`) olmalı:

```powershell
npm run rag:fetch     # data/rag-raw.json (public dataset, key gerekmez)
npm run rag:ingest    # iki stratejiyi de chunk+embed -> pgvector + HNSW
# veya tek strateji:  npm run rag:ingest -- structure
npm run dev
# http://localhost:3001/chat
```

> `rag:fetch` **ayrı** bir ham dosya (`data/rag-raw.json`) üretir; benchmark'ın
> `raw.json`'una dokunmaz. Neden ayrı: benchmark verisinde ortak başlık kırpılmış
> ve metin 2000 karaktere kesilmiş — bu yüzden (a) kararların ~%64'ünde "Esas/Karar
> No" başlığı silinmiş (**karar no** metadata'sı çıkmaz) ve (b) 2000 karakter
> ~tek chunk kalır. RAG için aynı 400 kararı (aynı deterministik örnekleme)
> **başlık kırpmadan, daha uzun** metinle çekeriz.

### 1) Chunking — iki strateji, iki tablo

| Strateji | Tablo | Nasıl |
| --- | --- | --- |
| `fixed` | `rag_chunks_fixed` | ~500 token kayan pencere, 50 token overlap. Künye sonrası gövdeden başlar. |
| `structure` | `rag_chunks_structure` | Kararın kendi bölüm başlıklarına göre (`İSTEMİN KONUSU`, `GEREKÇE`, `SONUÇ`…). Başlık yoksa **recursive fixed-size fallback**; çok büyük bölüm de içinde fixed-size'a düşer. |

Her chunk'a metadata: **karar no** (`E.2019/9 K.2020/3` — künyeden regex), **tarih**
(ISO; `karar_tarihi` alanı, fallback metinden parse), **bölüm adı** (structure'da
başlık; fixed'de `—`). Token sayacı gerçek tokenizer yerine karakter yaklaşıklığı
(`RAG_CHARS_PER_TOKEN`, naive); maliyet **raporlaması** API'nin gerçek `usage`'ını
kullanır.

### 2) Retrieval

`retrieve(query, strategy, topK)` — sorguyu embed eder, ilgili strateji tablosunda
pgvector cosine ile **top-k** chunk'ı **similarity skoruyla** döner. `top-k` UI'dan
ayarlanabilir (varsayılan **5**). Embed ve arama süresi **ayrı** ölçülür.

### 3) Generation

Sistem prompt'u modele: **yalnızca verilen kaynaklara** dayan, her iddiadan sonra
`[1]`, `[2]` ile **kaynak göster**, kaynaklarda cevap yoksa **aynen** şunu yaz:
`Bu soruya verilen kararlarda cevap bulamadım.` Cevap **streaming** ile gelir
(`temperature=0`). Prompt insası `src/rag/prompt.ts` içinde saf bir fonksiyon;
`/chat` debug panelinde gösterilen "modele giden tam prompt" ile **birebir aynı**.

### 4) UI (`/chat`)

- Solda **chat**, sağda **Kaynaklar** paneli.
- Her kaynak: **karar no · tarih · bölüm · similarity skoru · chunk metni**.
- Cevaptaki `[1]`'e tıklayınca ilgili kaynak panelde **vurgulanır** (scroll + ring).
- **Chunking stratejisi** (fixed / structure-aware) ve **top-k** UI'dan seçilebilir.
- Yükleme durumları ayrı: **"Aranıyor…"** → **"Cevap yazılıyor…"**.
- **Debug** görünümü: modele gönderilen tam prompt (system + user) açılır panelde.
- Her sorgu için **latency** (retrieval / generation **ayrı**) ve **token/maliyet**
  (sorgu embedding + prompt/completion, gerçek `usage`) gösterilir.

### Naive sınırlar (bilinçli)

- Hybrid (lexical + vektör) arama ve reranking **yok** (Hafta 8).
- Tek tur Q&A (önceki cevaplar prompt'a eklenmez); konuşma geçmişi retrieval'a
  dahil edilmez.
- Chunk tabloları drizzle migration'a dahil **değil**; `rag:ingest` idempotent raw
  DDL ile kurar (repodaki `createHnswIndex` ile aynı runtime-DDL yaklaşımı) — RAG
  modülü kendi kendine yeter.
- Token sayacı chunk boyutlandırmada yaklaşık (gerçek tokenizer değil).

---

## Notlar

- `results/*.md` dosyalarında yorum yok — yalnızca tablo ve ham sayı. Yorum sana ait.
- İleriki haftalar için: yeni bir ölçüm setinde `src/config.ts` içindeki
  `CURRENT_RUN` değerini değiştir; script'ler ve UI otomatik yeni klasörü kullanır.
