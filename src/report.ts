import { MODES, PROVIDERS, comboKey } from "./config";
import type { BenchmarkFile } from "./types";

/**
 * benchmark.md uretir. KURAL: sadece tablo + ham sayi. Yorum, "X daha iyi"
 * cumlesi, sebep aciklamasi YOK.
 */

function table(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

const f2 = (n: number | null | undefined): string =>
  n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2);

export function renderBenchmarkMd(b: BenchmarkFile): string {
  const parts: string[] = [];

  parts.push(`# Benchmark — ${b.run}`);
  parts.push(
    `generatedAt: ${b.generatedAt}\n\n` +
      `- Dondurulmus 10 sorgu; her kombinasyon ${b.config.runsPerCombo} kez kosuldu; top-${b.config.topK}, cosine.\n` +
      `- Latency yalnizca vektor deposunu olcer (sorgu-embedding suresi HARIC).\n` +
      `- recall@5 ground truth = AYNI provider'in pgvector-exact top5'i (provider bazinda ayri).`
  );

  parts.push(`\n## Konfigurasyon`);
  parts.push(
    table(
      ["anahtar", "deger"],
      [
        ["OpenAI model", `${b.config.openaiModel} (${b.config.openaiDim}d)`],
        ["HF model", `${b.config.hfModel} (${b.config.hfDim}d)`],
        ["Pinecone index (openai)", b.config.pineconeIndexOpenai],
        ["Pinecone index (hf)", b.config.pineconeIndexHf],
        ["hnsw.ef_search", b.config.hnswEfSearch],
        ["filtered query ids", b.config.filteredQueryIds.join(", ")],
        ["filter", `year >= ${b.config.filterYearGte}`],
      ]
    )
  );

  parts.push(`\n## Embedding uretimi`);
  parts.push(
    table(
      ["provider", "count", "toplam ms", "basarisiz", "token", "tahmini $"],
      PROVIDERS.map((p) => {
        const s = b.embedStats[p];
        return [
          p,
          s.count,
          s.totalMs,
          s.failures,
          s.totalTokens ?? "—",
          s.estCostUsd != null ? `$${s.estCostUsd.toFixed(6)}` : "—",
        ];
      })
    )
  );

  parts.push(`\n## HNSW index kurulum suresi (ms)`);
  parts.push(
    table(
      ["provider", "index build ms"],
      PROVIDERS.map((p) => [p, b.indexBuildMs[p]])
    )
  );

  parts.push(`\n## Pinecone upsert suresi (ms)`);
  parts.push(
    table(
      ["provider", "upsert ms"],
      PROVIDERS.map((p) => [p, b.pineconeUpsertMs[p]])
    )
  );

  parts.push(`\n## Kombinasyon ozeti (tum sorgu x kosu)`);
  parts.push(
    table(
      ["provider", "mode", "p50 ms", "p95 ms", "recall@5 ort"],
      PROVIDERS.flatMap((p) =>
        MODES.map((m) => {
          const c = b.comboSummary[comboKey(p, m)];
          return [p, m, f2(c.latency.p50), f2(c.latency.p95), f2(c.recallAt5Avg)];
        })
      )
    )
  );

  parts.push(`\n## Sorgu bazli recall@5 (approximate modlar)`);
  parts.push(
    table(
      ["query", "type", "oa/hnsw", "oa/pinecone", "hf/hnsw", "hf/pinecone"],
      b.perQuery.map((q) => [
        q.queryId,
        q.type,
        f2(q.combos[comboKey("openai", "pgvector-hnsw")].recallAt5),
        f2(q.combos[comboKey("openai", "pinecone")].recallAt5),
        f2(q.combos[comboKey("hf", "pgvector-hnsw")].recallAt5),
        f2(q.combos[comboKey("hf", "pinecone")].recallAt5),
      ])
    )
  );

  parts.push(`\n## Sorgu bazli latency p50 ms (tum kombinasyonlar)`);
  parts.push(
    table(
      ["query", "oa/exact", "oa/hnsw", "oa/pinecone", "hf/exact", "hf/hnsw", "hf/pinecone"],
      b.perQuery.map((q) => [
        q.queryId,
        f2(q.combos[comboKey("openai", "pgvector-exact")].latency.p50),
        f2(q.combos[comboKey("openai", "pgvector-hnsw")].latency.p50),
        f2(q.combos[comboKey("openai", "pinecone")].latency.p50),
        f2(q.combos[comboKey("hf", "pgvector-exact")].latency.p50),
        f2(q.combos[comboKey("hf", "pgvector-hnsw")].latency.p50),
        f2(q.combos[comboKey("hf", "pinecone")].latency.p50),
      ])
    )
  );

  parts.push(`\n## openai-exact vs hf-exact top5 kesisimi (0..${b.config.topK})`);
  parts.push(
    table(
      ["query", "type", "kesisim"],
      b.perQuery.map((q) => [q.queryId, q.type, q.crossProviderExactOverlap])
    )
  );

  parts.push(`\n## Filtreli kosu (year >= ${b.config.filterYearGte}) — donen sonuc sayisi + latency p50 ms`);
  for (const q of b.perQuery) {
    if (!q.filtered) continue;
    parts.push(`\n### ${q.queryId} — "${q.text}"`);
    parts.push(
      table(
        ["provider", "mode", "sonuc sayisi", "p50 ms", "p95 ms"],
        PROVIDERS.flatMap((p) =>
          MODES.map((m) => {
            const c = q.filtered![comboKey(p, m)];
            return [p, m, c.count, f2(c.latency.p50), f2(c.latency.p95)];
          })
        )
      )
    );
  }

  return parts.join("\n") + "\n";
}
