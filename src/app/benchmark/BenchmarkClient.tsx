"use client";

import { useEffect, useMemo, useState } from "react";
import { COMBOS } from "@/benchmark/combos";
import type { BenchmarkResponse } from "@/benchmark/api-types";

const LS_KEY = "tlr-predictions";
const f2 = (n: number | undefined | null) => (n == null ? "—" : n.toFixed(2));

export default function BenchmarkClient() {
  const [predInputs, setPredInputs] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, number> | null>(null);
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mount'ta SADECE kayitli tahminleri yukle — otomatik benchmark YOK.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        setSaved(parsed);
        setPredInputs(Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)])));
      }
    } catch {
      /* yok say */
    }
  }, []);

  function savePredictions() {
    const nums: Record<string, number> = {};
    for (const c of COMBOS) {
      const v = parseFloat(predInputs[c.id] ?? "");
      if (!Number.isNaN(v)) nums[c.id] = v;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(nums));
    setSaved(nums);
  }

  async function runBenchmark() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/benchmark", { method: "POST", cache: "no-store" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }
      setData((await res.json()) as BenchmarkResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function exportJson() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "benchmark-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const overlapMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.overlap.forEach((o) => m.set(`${o.a}|${o.b}`, o.avgOverlap));
    return m;
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">/benchmark</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Sabit sorgu seti (queries.json) · sıralı koşum · ilk sorgu warm-up (istatistiğe girmez) ·
          latency server-side
        </p>
      </div>

      {/* Tahmin formu — çalıştırma butonundan ÖNCE */}
      <section className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">Tahmin (koşmadan önce)</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          Her kombinasyon için beklediğin ortalama total latency (ms). Kaydedilir, sonuçların
          üstünde karşılaştırılır.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {COMBOS.map((c) => (
            <label key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{c.label}</span>
              <input
                type="number"
                inputMode="decimal"
                value={predInputs[c.id] ?? ""}
                onChange={(e) => setPredInputs((p) => ({ ...p, [c.id]: e.target.value }))}
                placeholder="ms"
                className="w-28 rounded border border-neutral-300 bg-white px-2 py-1 text-right font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
          ))}
        </div>
        <button
          onClick={savePredictions}
          className="mt-3 rounded border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700"
        >
          Tahminleri kaydet
        </button>
        {saved && <span className="ml-2 text-xs text-emerald-600">kaydedildi ✓</span>}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={runBenchmark}
          disabled={loading}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Çalışıyor..." : "Benchmark çalıştır"}
        </button>
        {data && (
          <button onClick={exportJson} className="rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            JSON export
          </button>
        )}
        {data && <span className="text-xs text-neutral-500">generatedAt: {data.generatedAt}</span>}
      </div>

      {error && (
        <pre className="whitespace-pre-wrap rounded bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </pre>
      )}

      {data && (
        <>
          {/* Tahmin vs gerçek */}
          {saved && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Tahmin vs Gerçek (ortalama total ms)</h2>
              <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 dark:bg-neutral-800">
                    <tr>
                      {["kombinasyon", "tahmin", "gerçek", "fark"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMBOS.map((c) => {
                      const actual = data.combos.find((x) => x.comboId === c.id)?.total.avg;
                      const pred = saved[c.id];
                      const delta = actual != null && pred != null ? actual - pred : null;
                      return (
                        <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-800">
                          <td className="px-3 py-1.5">{c.label}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{pred != null ? f2(pred) : "—"}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{f2(actual)}</td>
                          <td className={`px-3 py-1.5 font-mono text-xs ${delta != null && delta > 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {delta != null ? (delta > 0 ? "+" : "") + f2(delta) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Sonuç tablosu */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Sonuçlar (warm-up hariç)</h2>
            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 dark:bg-neutral-800">
                  <tr>
                    {["kombinasyon", "total p50", "total p95", "total avg", "search avg", "embed avg", "ölçülen/warmup"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.combos.map((c) => {
                    const label = COMBOS.find((x) => x.id === c.comboId)?.label ?? c.comboId;
                    return (
                      <tr key={c.comboId} className="border-t border-neutral-100 font-mono text-xs dark:border-neutral-800">
                        <td className="px-3 py-1.5 font-sans">{label}</td>
                        <td className="px-3 py-1.5">{f2(c.total.p50)}</td>
                        <td className="px-3 py-1.5">{f2(c.total.p95)}</td>
                        <td className="px-3 py-1.5 font-semibold">{f2(c.total.avg)}</td>
                        <td className="px-3 py-1.5">{f2(c.search.avg)}</td>
                        <td className="px-3 py-1.5">{f2(c.embedAvg)}</td>
                        <td className="px-3 py-1.5">{c.measuredCount}/{c.warmupCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {data.combos.some((c) => c.errors.length > 0) && (
              <pre className="whitespace-pre-wrap rounded bg-red-50 p-3 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {data.combos.flatMap((c) => c.errors.map((e) => `[${c.comboId}] ${e}`)).join("\n")}
              </pre>
            )}
          </section>

          {/* Top-5 örtüşme paneli */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Top-5 örtüşme paneli (sorgu ortalaması, 0–5)</h2>
            <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
              <table className="text-xs">
                <thead className="bg-neutral-100 dark:bg-neutral-800">
                  <tr>
                    <th className="px-3 py-2" />
                    {COMBOS.map((c) => (
                      <th key={c.id} className="px-3 py-2 font-mono font-semibold">{c.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMBOS.map((row) => (
                    <tr key={row.id} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="px-3 py-1.5 font-mono font-semibold">{row.id}</td>
                      {COMBOS.map((col) => {
                        const v = overlapMap.get(`${row.id}|${col.id}`) ?? 0;
                        const isDiag = row.id === col.id;
                        return (
                          <td
                            key={col.id}
                            className={`px-3 py-1.5 text-center font-mono ${isDiag ? "text-neutral-400" : ""}`}
                            style={!isDiag ? { backgroundColor: `rgba(16,185,129,${v / 5 * 0.35})` } : undefined}
                          >
                            {f2(v)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
