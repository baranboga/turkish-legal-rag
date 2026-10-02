"use client";

import { useEffect, useState } from "react";
import { COMBOS } from "@/benchmark/combos";
import type { DocumentDetail, SearchComboResult, SearchResponse } from "@/benchmark/api-types";

const fmtScore = (n: number) => n.toFixed(4);

/** Bir karara tiklayinca saklanan metni (kisa hal) getirip modal'da gosterir. */
function DocModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDoc(null);
    fetch(`/api/document?id=${id}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        return (await res.json()) as DocumentDetail;
      })
      .then((d) => !cancelled && setDoc(d))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="font-mono text-sm font-semibold">doc {id}</div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="rounded px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {loading && <p className="text-sm text-neutral-400">Yükleniyor...</p>}
          {error && (
            <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </pre>
          )}
          {doc && (
            <>
              <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-neutral-500">
                <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                  kaynak: {doc.sourceId}
                </span>
                {doc.year != null && (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">yıl: {doc.year}</span>
                )}
                {doc.category && (
                  <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{doc.category}</span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                {doc.text}
              </p>
              <p className="mt-3 text-[11px] text-neutral-400">
                Kararın saklanan kısa hali ({doc.text.length} karakter).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ComboCell({ r, onOpen }: { r: SearchComboResult | undefined; onOpen: (id: number) => void }) {
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
              <li key={h.documentId} className="rounded odd:bg-neutral-50 dark:odd:bg-neutral-800/40">
                <button
                  type="button"
                  onClick={() => onOpen(h.documentId)}
                  title="Kararın kısa halini oku"
                  className="w-full cursor-pointer rounded px-2 py-1.5 text-left transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">
                      #{h.rank} · doc {h.documentId}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-500">{fmtScore(h.score)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-neutral-600 dark:text-neutral-400">
                    {h.textPreview}
                  </p>
                </button>
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
  const [openId, setOpenId] = useState<number | null>(null);

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
          Tek sorgu · 6 kombinasyon (pgvector exact/HNSW + Pinecone × OpenAI/HF) · top-5 · latency
          server-side ölçülür · sonuca tıkla → kararın kısa halini oku
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
          <ComboCell key={c.id} r={byId(c.id)} onOpen={setOpenId} />
        ))}
      </div>

      {openId != null && <DocModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
