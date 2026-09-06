/**
 * Adim 6 — Olcum harness'i.
 *
 * 10 dondurulmus sorgu x 6 kombinasyon (2 provider x 3 mode), her biri
 * RUNS_PER_COMBO (=3) kez. Olculenler:
 *   - Latency p50 / p95 (ms) — sadece vektor deposu (query embedding HARIC;
 *     onceden hesaplanip cache'lenir, provider basina bir kez).
 *   - recall@5 — ground truth = AYNI provider'in pgvector-exact top5'i;
 *     hnsw/pinecone top5'inin bununla kesisimi / TOP_K. Provider bazinda ayri.
 *   - Ayni sorgu icin openai-exact vs hf-exact top5 kesisim sayisi.
 *   - Filtreli kosu: FILTERED_QUERY_IDS icin { yearGte } ile tekrar; donen
 *     sonuc sayisi da kaydedilir.
 *
 * HNSW index'i burada explicit + TIMED olarak (yeniden) olusturulur.
 * Cikti: results/<run>/benchmark.json + benchmark.md
 */
import "dotenv/config";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  FILTERED_QUERY_IDS,
  FILTER_YEAR_GTE,
  HF_EMBEDDING_DIM,
  HF_EMBEDDING_MODEL,
  HNSW_EF_SEARCH,
  MODES,
  OPENAI_EMBEDDING_DIM,
  OPENAI_EMBEDDING_MODEL,
  PINECONE_INDEX_HF,
  PINECONE_INDEX_OPENAI,
  PROVIDERS,
  RUNS_PER_COMBO,
  TOP_K,
  comboKey,
  resultsDir,
  type Mode,
  type Provider,
} from "../src/config";
import { loadQueries } from "../src/data";
import { db, queryClient } from "../src/db/client";
import { documents } from "../src/db/schema";
import { createHnswIndex, embedQuery, runSearch } from "../src/search";
import type {
  BenchmarkFile,
  ComboResult,
  EmbedProviderStats,
  EnrichedHit,
  FilteredComboResult,
  LatencyStats,
  PerQueryResult,
  SearchHit,
} from "../src/types";
import { renderBenchmarkMd } from "../src/report";

function round(x: number): number {
  return Math.round(x * 100) / 100;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function latency(values: number[]): LatencyStats {
  return { p50: round(percentile(values, 50)), p95: round(percentile(values, 95)) };
}

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function preview(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const queries = loadQueries();
  console.log(`Benchmark: ${queries.length} queries x ${PROVIDERS.length * MODES.length} combos x ${RUNS_PER_COMBO} runs`);

  // Doküman metinleri (UI preview icin)
  const docRows = await db.select({ id: documents.id, text: documents.text }).from(documents);
  const docText = new Map<number, string>(docRows.map((d) => [d.id, d.text]));
  if (docRows.length === 0) {
    throw new Error("documents tablosu bos. Once `npm run embed` calistir.");
  }

  // Sorgu embedding'lerini provider basina bir kez hesapla (latency'e dahil degil)
  console.log("Precomputing query embeddings...");
  const qEmb: Record<Provider, Map<string, number[]>> = { openai: new Map(), hf: new Map() };
  for (const provider of PROVIDERS) {
    for (const q of queries) {
      qEmb[provider].set(q.id, await embedQuery(provider, q.text));
    }
  }

  // HNSW index'i (yeniden) olustur + sureyi olc
  console.log("Building HNSW indexes (timed)...");
  const indexBuildMs: Record<Provider, number> = {
    openai: await createHnswIndex("openai"),
    hf: await createHnswIndex("hf"),
  };
  console.log(`  openai: ${indexBuildMs.openai}ms, hf: ${indexBuildMs.hf}ms`);

  const enrich = (hits: SearchHit[]): EnrichedHit[] =>
    hits.map((h, i) => ({
      rank: i + 1,
      documentId: h.documentId,
      score: h.score,
      textPreview: preview(docText.get(h.documentId)),
    }));

  const comboLatencies: Record<string, number[]> = {};
  const comboRecalls: Record<string, number[]> = {};
  for (const provider of PROVIDERS)
    for (const mode of MODES) {
      comboLatencies[comboKey(provider, mode)] = [];
      comboRecalls[comboKey(provider, mode)] = [];
    }

  const perQuery: PerQueryResult[] = [];

  for (const q of queries) {
    process.stdout.write(`  query ${q.id}\r`);
    const combos: Record<string, ComboResult> = {};
    const exactHits: Record<Provider, SearchHit[]> = { openai: [], hf: [] };

    for (const provider of PROVIDERS) {
      const vector = qEmb[provider].get(q.id)!;
      for (const mode of MODES) {
        const key = comboKey(provider, mode);
        const lats: number[] = [];
        let hits: SearchHit[] = [];
        for (let r = 0; r < RUNS_PER_COMBO; r++) {
          const t0 = performance.now();
          hits = await runSearch(vector, provider, mode);
          lats.push(performance.now() - t0);
        }
        comboLatencies[key].push(...lats);
        combos[key] = { provider, mode, latency: latency(lats), recallAt5: null, top5: enrich(hits) };
        if (mode === "pgvector-exact") exactHits[provider] = hits;
      }
    }

    // recall@5 (provider bazinda, ground truth = ayni provider exact)
    for (const provider of PROVIDERS) {
      const gt = new Set(exactHits[provider].map((h) => h.documentId));
      const denom = Math.max(1, gt.size);
      for (const mode of ["pgvector-hnsw", "pinecone"] as Mode[]) {
        const key = comboKey(provider, mode);
        const inter = combos[key].top5.filter((h) => gt.has(h.documentId)).length;
        const recall = round(inter / denom);
        combos[key].recallAt5 = recall;
        comboRecalls[key].push(recall);
      }
    }

    // openai-exact vs hf-exact kesisim
    const openaiExactIds = new Set(exactHits.openai.map((h) => h.documentId));
    const crossProviderExactOverlap = exactHits.hf.filter((h) => openaiExactIds.has(h.documentId)).length;

    // filtreli kosu
    let filtered: Record<string, FilteredComboResult> | undefined;
    if ((FILTERED_QUERY_IDS as readonly string[]).includes(q.id)) {
      filtered = {};
      for (const provider of PROVIDERS) {
        const vector = qEmb[provider].get(q.id)!;
        for (const mode of MODES) {
          const key = comboKey(provider, mode);
          const lats: number[] = [];
          let hits: SearchHit[] = [];
          for (let r = 0; r < RUNS_PER_COMBO; r++) {
            const t0 = performance.now();
            hits = await runSearch(vector, provider, mode, { yearGte: FILTER_YEAR_GTE });
            lats.push(performance.now() - t0);
          }
          filtered[key] = {
            provider,
            mode,
            latency: latency(lats),
            count: hits.length,
            top5: enrich(hits),
          };
        }
      }
    }

    perQuery.push({
      queryId: q.id,
      text: q.text,
      type: q.type,
      combos,
      crossProviderExactOverlap,
      filtered,
    });
  }

  // Kombinasyon ozeti (tum sorgu x kosu uzerinden)
  const comboSummary: BenchmarkFile["comboSummary"] = {};
  for (const provider of PROVIDERS)
    for (const mode of MODES) {
      const key = comboKey(provider, mode);
      comboSummary[key] = {
        provider,
        mode,
        latency: latency(comboLatencies[key]),
        recallAt5Avg: mode === "pgvector-exact" ? null : round(mean(comboRecalls[key])),
      };
    }

  // Onceki adimlardan istatistikler
  const embedStats =
    readJson<Record<Provider, EmbedProviderStats>>(`${resultsDir()}/embed-stats.json`) ??
    ({ openai: { totalMs: 0, failures: 0, count: 0 }, hf: { totalMs: 0, failures: 0, count: 0 } } as Record<
      Provider,
      EmbedProviderStats
    >);
  const pineStats = readJson<Record<Provider, { upsertMs: number }>>(`${resultsDir()}/pinecone-stats.json`);
  const pineconeUpsertMs: Record<Provider, number> = {
    openai: pineStats?.openai?.upsertMs ?? 0,
    hf: pineStats?.hf?.upsertMs ?? 0,
  };

  const out: BenchmarkFile = {
    run: resultsDir().split("/").pop()!,
    generatedAt: new Date().toISOString(),
    config: {
      topK: TOP_K,
      runsPerCombo: RUNS_PER_COMBO,
      openaiModel: OPENAI_EMBEDDING_MODEL,
      openaiDim: OPENAI_EMBEDDING_DIM,
      hfModel: HF_EMBEDDING_MODEL,
      hfDim: HF_EMBEDDING_DIM,
      pineconeIndexOpenai: PINECONE_INDEX_OPENAI,
      pineconeIndexHf: PINECONE_INDEX_HF,
      hnswEfSearch: HNSW_EF_SEARCH,
      filteredQueryIds: [...FILTERED_QUERY_IDS],
      filterYearGte: FILTER_YEAR_GTE,
    },
    embedStats,
    indexBuildMs,
    pineconeUpsertMs,
    comboSummary,
    perQuery,
  };

  mkdirSync(resultsDir(), { recursive: true });
  writeFileSync(`${resultsDir()}/benchmark.json`, JSON.stringify(out, null, 2), "utf8");
  writeFileSync(`${resultsDir()}/benchmark.md`, renderBenchmarkMd(out), "utf8");
  console.log(`\nWrote ${resultsDir()}/benchmark.json + benchmark.md`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
