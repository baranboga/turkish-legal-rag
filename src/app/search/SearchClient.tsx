"use client";

import { useState } from "react";
import { COMBOS } from "@/benchmark/combos";
import type { SearchComboResult, SearchResponse } from "@/benchmark/api-types";

const fmtScore = (n: number) => n.toFixed(4);

function ComboCell({ r }: { r: SearchComboResult | undefined }) {
  const combo = COMBOS.find((c) => c.id === r?.comboId);
  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div
        className={`rounded-t-lg px-3 py-2 ${
          r?.store === "pgvector" ? "bg-emerald-50 dark:bg-emerald-950/40" : "bg-orange-50 dark:bg-orange-950/40"
        }`}
      >
        <div className="text-sm font-semibold">{combo?.label ?? r?.comboId}</div>
        {r && !r.error && (
          <div className="mt-0.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
            embed {r.embedTime}ms · search {r.searchTime}ms · total {r.totalTime}ms
          </div>
        )}
      </div>
      <div className="p-2">
        {!r && <p className="px-1 text-xs text-neutral-400">—</p>}
        {r?.error && (
          <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {r.error}
          </pre>
        )}
        {r?.top5 && (
          <ul className="space-y-1">
            {r.top5.length === 0 && <li className="px-1 text-xs text-neutral-400">sonuc yok</li>}
            {r.top5.map((h) => (
              <li key={h.documentId} className="rounded px-2 py-1.5 odd:bg-neutral-50 dark:odd:bg-neutral-800/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs">
                    #{h.rank} · doc {h.documentId}
                  </span>
                  <span className="font-mono text-[11px] text-neutral-500">{fmtScore(h.score)}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
                  {h.textPreview}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function SearchClient() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`HTTP ${res.status}: ${t}`);
      }
      setData((await res.json()) as SearchResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const byId = (id: string) => data?.results.find((r) => r.comboId === id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">/search</h1>
        <p className="mt-1 text-xs text-neutral-500">
          Tek sorgu · 2×2 grid (2 store × 2 provider) · top-5 · latency server-side ölçülür
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="Türkçe hukuk sorgusu yaz..."
          className="min-w-[300px] flex-1 rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          onClick={runSearch}
          disabled={loading || !query.trim()}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {loading ? "Aranıyor..." : "Ara"}
        </button>
      </div>

      {error && (
        <pre className="whitespace-pre-wrap rounded bg-red-50 p-3 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </pre>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {COMBOS.map((c) => (
          <ComboCell key={c.id} r={byId(c.id)} />
        ))}
      </div>
    </div>
  );
}
