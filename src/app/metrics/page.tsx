import { MODES, PROVIDERS, comboKey } from "@/config";
import { loadBenchmark, loadSyncTestMd, parseSyncSummary } from "@/results";
import EmptyState from "../_components/EmptyState";
import Table from "../_components/Table";

export const dynamic = "force-dynamic";

const f2 = (n: number | null | undefined): string =>
  n == null ? "—" : (Math.round(n * 100) / 100).toFixed(2);

export default function MetricsPage() {
  const b = loadBenchmark();
  if (!b) return <EmptyState />;

  const syncMd = loadSyncTestMd();
  const sync = syncMd ? parseSyncSummary(syncMd) : [];
  const oa = b.embedStats.openai;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">/metrics</h1>
        <p className="mt-1 text-xs text-neutral-500">
          run: <span className="font-mono">{b.run}</span> · generatedAt: {b.generatedAt} · top-
          {b.config.topK} · her kombinasyon {b.config.runsPerCombo}x
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Kombinasyon ozeti — latency &amp; recall@5</h2>
        <Table
          headers={["provider", "mode", "p50 (ms)", "p95 (ms)", "recall@5 ort"]}
          rows={PROVIDERS.flatMap((p) =>
            MODES.map((m) => {
              const c = b.comboSummary[comboKey(p, m)];
              return [p, m, f2(c.latency.p50), f2(c.latency.p95), f2(c.recallAt5Avg)];
            })
          )}
        />
        <p className="text-xs text-neutral-500">
          recall@5 ground truth = ayni provider&apos;in pgvector-exact top5&apos;i; exact icin
          tanimsiz (—).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Index kurulum &amp; embedding &amp; upsert sureleri</h2>
        <Table
          headers={[
            "provider",
            "HNSW index build (ms)",
            "embedding uretim (ms)",
            "embedding failures",
            "Pinecone upsert (ms)",
          ]}
          rows={PROVIDERS.map((p) => [
            p,
            b.indexBuildMs[p],
            b.embedStats[p].totalMs,
            b.embedStats[p].failures,
            b.pineconeUpsertMs[p],
          ])}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">OpenAI token / maliyet</h2>
        <Table
          headers={["model", "toplam token", "tahmini maliyet (USD)"]}
          rows={[
            [
              b.config.openaiModel,
              oa.totalTokens ?? "—",
              oa.estCostUsd != null ? `$${oa.estCostUsd.toFixed(6)}` : "—",
            ],
          ]}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Sync testi — silinen 5 kaydin silindikten sonra durumu</h2>
        {sync.length ? (
          <Table
            headers={["mode", "silindikten sonra hala donen silinmis kayit"]}
            rows={sync.map((s) => [s.mode, s.count])}
          />
        ) : (
          <p className="text-sm text-neutral-500">
            <span className="font-mono">sync-test.md</span> bulunamadi. <span className="font-mono">npm run sync-test</span> calistir.
          </p>
        )}
      </section>
    </div>
  );
}
