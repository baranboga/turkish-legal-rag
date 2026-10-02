"use client";

import { useRef, useState } from "react";
import type {
  ChatEvent,
  GenerationTiming,
  PromptDebug,
  RagSource,
  RagStrategy,
  RetrievalTiming,
} from "@/rag/types";

// --- UI sabitleri (config'i client bundle'a sizdirmamak icin burada) ---
const STRATEGY_OPTIONS: { value: RagStrategy; label: string; desc: string }[] = [
  { value: "fixed", label: "fixed-size", desc: "~500 token, 50 overlap kayan pencere" },
  { value: "structure", label: "structure-aware", desc: "karar bölümlerine göre; başlık yoksa fixed" },
];
const TOP_K_DEFAULT = 5;
const TOP_K_MAX = 20;

const fmtScore = (n: number) => n.toFixed(4);
const fmtCost = (usd: number) => `$${usd.toFixed(6)}`;

interface Turn {
  id: number;
  question: string;
  strategy: RagStrategy;
  topK: number;
  status: "searching" | "generating" | "done" | "error";
  answer: string;
  sources: RagSource[];
  model?: string;
  retrieval?: RetrievalTiming;
  generation?: GenerationTiming;
  totalCostUsd?: number;
  prompt?: PromptDebug;
  error?: string;
}

/** Cevap metnini [n] atiflarini tiklanabilir yaparak render eder. */
function AnswerText({
  turn,
  onCite,
}: {
  turn: Turn;
  onCite: (turnId: number, n: number) => void;
}) {
  const parts = turn.answer.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
          const n = Number(m[1]);
          const valid = turn.sources.some((s) => s.n === n);
          return (
            <button
              key={i}
              type="button"
              disabled={!valid}
              onClick={() => onCite(turn.id, n)}
              title={valid ? `Kaynak [${n}]'i panelde göster` : "Bilinmeyen kaynak"}
              className={`mx-0.5 inline-flex items-center rounded px-1 text-[11px] font-semibold align-baseline ${
                valid
                  ? "cursor-pointer bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300"
                  : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
              }`}
            >
              [{n}]
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {turn.status === "generating" && (
        <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-neutral-500 align-middle" />
      )}
    </p>
  );
}

/** Tek turun latency + token/maliyet ozeti. */
function Metrics({ turn }: { turn: Turn }) {
  const r = turn.retrieval;
  const g = turn.generation;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 sm:grid-cols-4">
      {r && (
        <>
          <dt className="text-neutral-500">retrieval</dt>
          <dd>
            embed {r.embedMs}ms · search {r.searchMs}ms
          </dd>
          <dt className="text-neutral-500">sorgu token</dt>
          <dd>
            {r.queryTokens} · {fmtCost(r.queryCostUsd)}
          </dd>
        </>
      )}
      {g && (
        <>
          <dt className="text-neutral-500">generation</dt>
          <dd>{g.ms}ms</dd>
          <dt className="text-neutral-500">token (p/c)</dt>
          <dd>
            {g.promptTokens} / {g.completionTokens}
          </dd>
        </>
      )}
      {turn.totalCostUsd != null && (
        <>
          <dt className="text-neutral-500">toplam maliyet</dt>
          <dd className="font-semibold text-neutral-800 dark:text-neutral-200">
            {fmtCost(turn.totalCostUsd)}
          </dd>
          {turn.model && (
            <>
              <dt className="text-neutral-500">model</dt>
              <dd>{turn.model}</dd>
            </>
          )}
        </>
      )}
    </dl>
  );
}

/** Kaynaklar panelindeki tek kart. */
function SourceCard({
  s,
  turnId,
  highlighted,
}: {
  s: RagSource;
  turnId: number;
  highlighted: boolean;
}) {
  return (
    <li
      id={`src-${turnId}-${s.n}`}
      className={`rounded-lg border bg-white p-3 transition dark:bg-neutral-900 ${
        highlighted
          ? "border-blue-500 ring-2 ring-blue-500/60"
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-[11px] font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
          {s.n}
        </span>
        <span className="font-mono text-[11px] text-neutral-500">skor {fmtScore(s.score)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-neutral-500">
        {s.kararNo && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
            {s.kararNo}
          </span>
        )}
        {s.tarih && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{s.tarih}</span>
        )}
        {s.bolum && s.bolum !== "—" && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">{s.bolum}</span>
        )}
      </div>
      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-snug text-neutral-700 dark:text-neutral-300">
        {s.text}
      </p>
    </li>
  );
}

export default function ChatClient() {
  const [query, setQuery] = useState("");
  const [strategy, setStrategy] = useState<RagStrategy>("structure");
  const [topK, setTopK] = useState(TOP_K_DEFAULT);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedTurnId, setSelectedTurnId] = useState<number | null>(null);
  const [highlightedN, setHighlightedN] = useState<number | null>(null);
  const nextId = useRef(1);

  function patchTurn(id: number, patch: Partial<Turn> | ((t: Turn) => Partial<Turn>)) {
    setTurns((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...(typeof patch === "function" ? patch(t) : patch) } : t))
    );
  }

  function onCite(turnId: number, n: number) {
    setSelectedTurnId(turnId);
    setHighlightedN(n);
    requestAnimationFrame(() => {
      document.getElementById(`src-${turnId}-${n}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function ask() {
    const q = query.trim();
    if (!q || busy) return;
    const id = nextId.current++;
    const turn: Turn = {
      id,
      question: q,
      strategy,
      topK,
      status: "searching",
      answer: "",
      sources: [],
    };
    setTurns((prev) => [...prev, turn]);
    setSelectedTurnId(id);
    setHighlightedN(null);
    setQuery("");
    setBusy(true);

    try {
      const res = await fetch("/api/rag/chat", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, strategy, topK }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

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
          const ev = JSON.parse(line) as ChatEvent;
          if (ev.type === "meta") {
            patchTurn(id, {
              status: "generating",
              sources: ev.sources,
              retrieval: ev.retrieval,
              prompt: ev.prompt,
              model: ev.model,
            });
          } else if (ev.type === "token") {
            patchTurn(id, (t) => ({ answer: t.answer + ev.text }));
          } else if (ev.type === "done") {
            patchTurn(id, {
              status: "done",
              generation: ev.generation,
              totalCostUsd: ev.totalCostUsd,
            });
          } else if (ev.type === "error") {
            patchTurn(id, { status: "error", error: ev.message });
          }
        }
      }
      // stream beklenmedik sekilde bittiyse ve hala "generating" ise kapat
      patchTurn(id, (t) => (t.status === "generating" || t.status === "searching" ? { status: "done" } : {}));
    } catch (e) {
      patchTurn(id, { status: "error", error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const selectedTurn =
    turns.find((t) => t.id === selectedTurnId) ?? (turns.length ? turns[turns.length - 1] : null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">/chat — naive RAG</h1>
        <p className="mt-1 text-xs text-neutral-500">
          chunk → embed → retrieve → buildPrompt → generate · pgvector (OpenAI embedding) +{" "}
          {"gpt-4o-mini"} · yalnızca kaynaklara dayalı yanıt, [n] ile atıf · framework yok (çıplak
          OpenAI + Supabase)
        </p>
      </div>

      {/* Kontroller */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500">Chunking stratejisi</span>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as RagStrategy)}
            disabled={busy}
            className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            {STRATEGY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-neutral-500">top-k</span>
          <input
            type="number"
            min={1}
            max={TOP_K_MAX}
            value={topK}
            onChange={(e) => setTopK(Math.min(TOP_K_MAX, Math.max(1, Number(e.target.value) || 1)))}
            disabled={busy}
            className="w-20 rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <p className="mb-1 text-[11px] text-neutral-400">
          {STRATEGY_OPTIONS.find((o) => o.value === strategy)?.desc}
        </p>
      </div>

      {/* 2 kolon: sol chat, sag kaynaklar */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* SOL: chat */}
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask();
                }
              }}
              rows={2}
              placeholder="Türkçe hukuk sorusu yaz... (Enter = gönder, Shift+Enter = yeni satır)"
              className="min-h-[52px] flex-1 resize-y rounded border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              onClick={ask}
              disabled={busy || !query.trim()}
              className="h-[52px] shrink-0 rounded bg-neutral-900 px-5 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
            >
              {busy ? "Çalışıyor..." : "Sor"}
            </button>
          </div>

          {turns.length === 0 && (
            <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
              Henüz soru yok. Bir soru yaz ve &quot;Sor&quot;a bas.
            </p>
          )}

          {turns.map((turn) => (
            <div
              key={turn.id}
              onClick={() => setSelectedTurnId(turn.id)}
              className={`space-y-2 rounded-lg border bg-white p-4 dark:bg-neutral-900 ${
                selectedTurn?.id === turn.id
                  ? "border-neutral-400 dark:border-neutral-600"
                  : "border-neutral-200 dark:border-neutral-800"
              }`}
            >
              {/* Soru */}
              <div className="flex items-start gap-2">
                <span className="mt-0.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-500 dark:bg-neutral-800">
                  SORU
                </span>
                <p className="text-sm font-medium">{turn.question}</p>
              </div>
              <div className="flex flex-wrap gap-1 text-[10px] text-neutral-400">
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                  {turn.strategy}
                </span>
                <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                  top-k {turn.topK}
                </span>
              </div>

              {/* Durum / cevap */}
              {turn.status === "searching" && (
                <p className="text-sm text-neutral-500">
                  <span className="inline-block animate-pulse">Aranıyor…</span>
                </p>
              )}
              {turn.status === "generating" && turn.answer === "" && (
                <p className="text-sm text-neutral-500">
                  <span className="inline-block animate-pulse">Cevap yazılıyor…</span>
                </p>
              )}
              {turn.answer !== "" && <AnswerText turn={turn} onCite={onCite} />}

              {turn.status === "error" && (
                <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {turn.error}
                </pre>
              )}

              {(turn.retrieval || turn.generation) && <Metrics turn={turn} />}

              {/* Debug: modele giden tam prompt */}
              {turn.prompt && (
                <details className="mt-1 rounded border border-neutral-200 dark:border-neutral-800">
                  <summary className="cursor-pointer px-2 py-1 text-[11px] text-neutral-500">
                    Debug · modele gönderilen tam prompt
                  </summary>
                  <div className="space-y-2 border-t border-neutral-200 p-2 dark:border-neutral-800">
                    <div>
                      <div className="mb-1 text-[10px] font-semibold text-neutral-400">SYSTEM</div>
                      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-[11px] text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                        {turn.prompt.system}
                      </pre>
                    </div>
                    <div>
                      <div className="mb-1 text-[10px] font-semibold text-neutral-400">USER</div>
                      <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 text-[11px] text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">
                        {turn.prompt.user}
                      </pre>
                    </div>
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>

        {/* SAG: Kaynaklar */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Kaynaklar</h2>
              {selectedTurn && selectedTurn.sources.length > 0 && (
                <span className="font-mono text-[11px] text-neutral-500">
                  {selectedTurn.sources.length} chunk
                </span>
              )}
            </div>

            {!selectedTurn && (
              <p className="mt-3 text-xs text-neutral-400">Sorunun kaynakları burada görünecek.</p>
            )}
            {selectedTurn && selectedTurn.status === "searching" && (
              <p className="mt-3 animate-pulse text-xs text-neutral-400">Aranıyor…</p>
            )}
            {selectedTurn && selectedTurn.status !== "searching" && selectedTurn.sources.length === 0 && (
              <p className="mt-3 text-xs text-neutral-400">Kaynak bulunamadı.</p>
            )}

            {selectedTurn && selectedTurn.sources.length > 0 && (
              <ul className="mt-3 max-h-[calc(100vh-10rem)] space-y-2 overflow-y-auto pr-1">
                {selectedTurn.sources.map((s) => (
                  <SourceCard
                    key={s.n}
                    s={s}
                    turnId={selectedTurn.id}
                    highlighted={highlightedN === s.n}
                  />
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
