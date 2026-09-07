import { NextResponse } from "next/server";
import { COMBOS } from "@/benchmark/combos";
import { computeOverlap, getDocTextMap, runBenchQuery } from "@/benchmark/core";
import { avg, percentile } from "@/benchmark/stats";
import { loadQueries } from "@/data";
import type { BenchComboStats, BenchRun } from "@/benchmark/api-types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(): Promise<Response> {
  const queries = loadQueries();
  const docText = await getDocTextMap();

  const combos: BenchComboStats[] = [];
  // Kombinasyonlar sirali — Promise.all YOK.
  for (const combo of COMBOS) {
    const runs: BenchRun[] = [];
    // Sorgular sirali. Ilk sorgu warm-up (istatistige girmez).
    for (let qi = 0; qi < queries.length; qi++) {
      const q = queries[qi];
      runs.push(await runBenchQuery(q.text, q.id, qi === 0, combo, docText));
    }

    const measured = runs.filter((r) => !r.warmup && !r.error);
    const totals = measured.map((r) => r.totalTime as number);
    const searches = measured.map((r) => r.searchTime as number);
    const embeds = measured.map((r) => r.embedTime as number);

    combos.push({
      comboId: combo.id,
      store: combo.store,
      provider: combo.provider,
      total: { p50: percentile(totals, 50), p95: percentile(totals, 95), avg: avg(totals) },
      search: { p50: percentile(searches, 50), p95: percentile(searches, 95), avg: avg(searches) },
      embedAvg: avg(embeds),
      measuredCount: measured.length,
      warmupCount: runs.filter((r) => r.warmup).length,
      errors: runs.filter((r) => r.error).map((r) => `${r.queryId}: ${r.error}`),
      runs,
    });
  }

  const overlap = computeOverlap(
    combos,
    queries.map((q) => q.id)
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      queries: queries.map((q) => ({ id: q.id, type: q.type, text: q.text })),
      combos,
      overlap,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
