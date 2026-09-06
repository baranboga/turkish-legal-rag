"use client";

import { useMemo, useState } from "react";
import type { BenchmarkFile, EnrichedHit, PerQueryResult } from "@/types";

type Provider = "openai" | "hf";
type Mode = "pgvector-exact" | "pgvector-hnsw" | "pinecone";

const COLUMNS: { provider: Provider; mode: Mode; key: string }[] = [
  { provider: "openai", mode: "pgvector-exact", key: "openai:pgvector-exact" },
  { provider: "openai", mode: "pgvector-hnsw", key: "openai:pgvector-hnsw" },
  { provider: "openai", mode: "pinecone", key: "openai:pinecone" },
  { provider: "hf", mode: "pgvector-exact", key: "hf:pgvector-exact" },
  { provider: "hf", mode: "pgvector-hnsw", key: "hf:pgvector-hnsw" },
  { provider: "hf", mode: "pinecone", key: "hf:pinecone" },
];

const score4 = (n: number) => n.toFixed(4);

/** Bir provider icin exact vs approximate kimlik kumeleri. */
function highlightSets(q: PerQueryResult, provider: Provider) {
  const ids = (mode: Mode) =>
    new Set((q.combos[`${provider}:${mode}`]?.top5 ?? []).map((h) => h.documentId));
  return {
    exact: ids("pgvector-exact"),
    hnsw: ids("pgvector-hnsw"),
    pinecone: ids("pinecone"),
  };
}

function HitRow({
  hit,
  tone,
  badge,
}: {
  hit: EnrichedHit;
  tone: "normal" | "missed" | "extra";
  badge?: string;
}) {
  const toneClass =
    tone === "missed"
      ? "border-l-4 border-red-500 bg-red-50 dark:bg-red-950/40"
      : tone === "extra"
        ? "border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40"
        : "border-l-4 border-transparent";
  return (
    <li className={`rounded px-2 py-1.5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs">
          #{hit.rank} · doc {hit.documentId}
        </span>
        <span className="font-mono text-[11px] text-neutral-500">{score4(hit.score)}</span>
      </div>
      {badge && (
        <span className="mt-0.5 inline-block rounded bg-black/5 px-1 text-[10px] uppercase tracking-wide text-neutral-600 dark:bg-white/10 dark:text-neutral-300">
          {badge}
        </span>
      )}
      <p className="mt-0.5 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
        {hit.textPreview}
      </p>
    </li>
  );
}

export default function CompareClient({ data }: { data: BenchmarkFile }) {
  const [selectedId, setSelectedId] = useState(data.perQuery[0]?.queryId ?? "");
  const [showFiltered, setShowFiltered] = useState(false);

  const q = useMemo(
    () => data.perQuery.find((x) => x.queryId === selectedId) ?? data.perQuery[0],
    [data.perQuery, selectedId]
  );

  const sets = useMemo(
    () => ({ openai: highlightSets(q, "openai"), hf: highlightSets(q, "hf") }),
    [q]
  );

  const hasFiltered = !!q.filtered;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">/compare</h1>
        <p className="mt-1 text-xs text-neutral-500">
          run: <span className="font-mono">{data.run}</span> · 2 provider × 3 mode · top-
          {data.config.topK}
        </p>
      </div>

      {/* Sorgu secici */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Sorgu:</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="max-w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {data.perQuery.map((x) => (
            <option key={x.queryId} value={x.queryId}>
              {x.queryId} · [{x.type}] · {x.text}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-900">
        <span className="font-mono text-xs text-neutral-500">{q.queryId}</span>{" "}
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">
          {q.type}
        </span>
        <span className="ml-2">{q.text}</span>
        <span className="ml-3 text-xs text-neutral-500">
          openai-exact ∩ hf-exact = {q.crossProviderExactOverlap}/{data.config.topK}
        </span>
      </div>

      {/* Aciklama */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 border-l-4 border-red-500 bg-red-50 dark:bg-red-950/40" />
          exact&apos;te var, iki approx&apos;ta da yok (kacirilan)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/40" />
          exact&apos;te yok, approx&apos;te var (fazladan)
        </span>
        {hasFiltered && (
          <label className="ml-auto flex items-center gap-2">
            <input
              type="checkbox"
              checked={showFiltered}
              onChange={(e) => setShowFiltered(e.target.checked)}
            />
            Filtreli sonuclari da goster (year ≥ {data.config.filterYearGte})
          </label>
        )}
      </div>

      {/* 6 kolon */}
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-3">
          {COLUMNS.map((col) => {
            const combo = q.combos[col.key];
            const providerSets = sets[col.provider];
            const isExact = col.mode === "pgvector-exact";
            const filteredCombo = q.filtered?.[col.key];

            return (
              <div
                key={col.key}
                className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div
                  className={`rounded-t-lg px-3 py-2 ${
                    col.provider === "openai"
                      ? "bg-sky-50 dark:bg-sky-950/40"
                      : "bg-violet-50 dark:bg-violet-950/40"
                  }`}
                >
                  <div className="text-sm font-semibold">{col.provider}</div>
                  <div className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                    {col.mode}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-neutral-500">
                    p50 {combo.latency.p50}ms · p95 {combo.latency.p95}ms
                    {combo.recallAt5 != null && <> · recall {combo.recallAt5.toFixed(2)}</>}
                  </div>
                </div>

                <ul className="space-y-1 p-2">
                  {combo.top5.map((hit) => {
                    let tone: "normal" | "missed" | "extra" = "normal";
                    let badge: string | undefined;
                    if (isExact) {
                      const missed =
                        !providerSets.hnsw.has(hit.documentId) &&
                        !providerSets.pinecone.has(hit.documentId);
                      if (missed) {
                        tone = "missed";
                        badge = "iki approx'ta da yok";
                      }
                    } else if (!providerSets.exact.has(hit.documentId)) {
                      tone = "extra";
                      badge = "exact'te yok";
                    }
                    return <HitRow key={hit.documentId} hit={hit} tone={tone} badge={badge} />;
                  })}
                </ul>

                {showFiltered && filteredCombo && (
                  <div className="border-t border-neutral-200 dark:border-neutral-800">
                    <div className="bg-neutral-50 px-3 py-1.5 dark:bg-neutral-800/50">
                      <span className="text-[11px] font-semibold">
                        Filtreli · {filteredCombo.count} sonuc
                      </span>
                      <span className="ml-2 font-mono text-[10px] text-neutral-500">
                        p50 {filteredCombo.latency.p50}ms
                      </span>
                    </div>
                    <ul className="space-y-1 p-2">
                      {filteredCombo.top5.length === 0 && (
                        <li className="px-2 py-1 text-[11px] text-neutral-500">sonuc yok</li>
                      )}
                      {filteredCombo.top5.map((hit) => (
                        <HitRow key={hit.documentId} hit={hit} tone="normal" />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
