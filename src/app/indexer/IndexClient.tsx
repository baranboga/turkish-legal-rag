"use client";

import { useState } from "react";
import { COMBOS } from "@/benchmark/combos";
import type { IndexEvent, IndexResult } from "@/benchmark/api-types";

interface ComboState {
  status: "idle" | "running" | "done" | "error";
  phase?: string;
  done?: number;
  total?: number;
  result?: IndexResult;
  error?: string;
}

export default function IndexClient({ initial = {} }: { initial?: Record<string, IndexResult> }) {
  // Diskten gelen kayitli sonuclarla baslat (varsa "done"), yoksa "idle".
  const [state, setState] = useState<Record<string, ComboState>>(() =>
    Object.fromEntries(
      COMBOS.map((c) => {
        const r = initial[c.id];
        return [c.id, r ? ({ status: "done", result: r } as ComboState) : ({ status: "idle" } as ComboState)];
      })
    )
  );
  const [busy, setBusy] = useState(false);

  function patch(id: string, s: Partial<ComboState>) {
    setState((prev) => ({ ...prev, [id]: { ...prev[id], ...s } }));
  }

  async function runIndex(comboId: string) {
    patch(comboId, { status: "running", phase: "başlıyor", done: 0, total: undefined, result: undefined, error: undefined });
    try {
      const res = await fetch("/api/indexer", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboId }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as IndexEvent;
          if (ev.type === "progress") {
            patch(comboId, { phase: ev.phase + (ev.message ? ` — ${ev.message}` : ""), done: ev.done, total: ev.total });
          } else if (ev.type === "result") {
            patch(comboId, { status: "done", result: ev.result });
          } else if (ev.type === "error") {
            patch(comboId, { status: "error", error: ev.message });
          }
        }
      }
    } catch (e) {
      patch(comboId, { status: "error", error: (e as Error).message });
    }
  }

  async function runAll() {
    setBusy(true);
    for (const c of COMBOS) {
      await runIndex(c.id); // sirali
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">/index</h1>
          <p className="mt-1 text-xs text-neutral-500">
            Kombinasyon başına indexleme · 400 doküman embed + store · süre &amp; token server-side ·
            sonuçlar <span className="font-mono">results/&lt;run&gt;/index-stats.json</span>&apos;a kaydedilir
          </p>
        </div>
        <button
          onClick={runAll}
          disabled={busy}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
          {busy ? "Çalışıyor..." : "Hepsini sırayla indexle"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {COMBOS.map((c) => {
          const s = state[c.id];
          const pct = s.total ? Math.round(((s.done ?? 0) / s.total) * 100) : s.status === "running" ? 5 : 0;
          return (
            <div key={c.id} className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{c.label}</span>
                <button
                  onClick={() => runIndex(c.id)}
                  disabled={s.status === "running" || busy}
                  className="rounded border border-neutral-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-neutral-700"
                >
                  {s.status === "running" ? "..." : "Index et"}
                </button>
              </div>

              {s.status === "running" && (
                <div className="mt-2">
                  <div className="h-2 w-full overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-neutral-500">
                    {s.phase} {s.total ? `· ${s.done}/${s.total}` : ""}
                  </p>
                </div>
              )}

              {s.status === "done" && s.result && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono text-[11px]">
                  <dt className="text-neutral-500">embed</dt>
                  <dd>{s.result.embedTimeMs} ms</dd>
                  <dt className="text-neutral-500">store</dt>
                  <dd>{s.result.storeTimeMs} ms</dd>
                  <dt className="text-neutral-500">total</dt>
                  <dd className="font-semibold">{s.result.totalTimeMs} ms</dd>
                  <dt className="text-neutral-500">count</dt>
                  <dd>{s.result.count}</dd>
                  <dt className="text-neutral-500">failures</dt>
                  <dd className={s.result.failures ? "text-red-600" : ""}>{s.result.failures}</dd>
                  {s.result.tokens != null && (
                    <>
                      <dt className="text-neutral-500">tokens</dt>
                      <dd>{s.result.tokens}</dd>
                      <dt className="text-neutral-500">~cost</dt>
                      <dd>${s.result.estCostUsd?.toFixed(6)}</dd>
                    </>
                  )}
                </dl>
              )}

              {s.status === "done" && s.result?.indexedAt && (
                <p className="mt-1 text-[10px] text-neutral-400">kaydedildi · {s.result.indexedAt}</p>
              )}

              {s.result?.errors && s.result.errors.length > 0 && (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {s.result.errors.join("\n")}
                </pre>
              )}

              {s.status === "error" && (
                <pre className="mt-2 whitespace-pre-wrap rounded bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {s.error}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
