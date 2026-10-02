/**
 * Adim (RAG) — RAG ham verisi cekme.
 *
 * benchmark'in `data/raw.json`'undan FARKLI bir dosya uretir (`data/rag-raw.json`):
 *   - Ortak baslik KIRPILMAZ (stripDecisionHeader uygulanmaz) — cunku "Esas/Karar
 *     No" kunyesi metnin en basindadir ve karar no metadata'si oradan cikarilir.
 *   - Metin daha uzun tutulur (RAG_TEXT_MAX_CHARS) — gercek chunking icin (2000
 *     karakter ~ tek chunk kalirdi).
 * AYNI 400 karari getirmek icin 01-fetch-data.ts ile AYNI deterministik stratified
 * ornekleme (windowOffsets) kullanilir. datasets-server publictir, token gerekmez.
 *
 * NOT: datasets-server cok uzun metin hucrelerini kuyruktan kirpabilir
 * (truncated_cells). Kunye (ve dolayisiyla karar no) metnin basinda oldugu icin
 * bundan ETKILENMEZ; yalnizca cok uzun kararlarin sonu eksik kalabilir (naive).
 *
 * Cikti: data/rag-raw.json
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { DATASET, RAG_DATA_FILE, RAG_TEXT_MAX_CHARS } from "../src/config";
import type { RagRawRecord } from "../src/data";

const BASE = "https://datasets-server.huggingface.co/rows";
const PAGE = 100;

// Dataset gated hale geldi (Hafta 5-6'da publicti). Varsa HF_TOKEN ile auth et.
const HF_TOKEN = process.env.HF_TOKEN?.trim();
const authHeaders: Record<string, string> = HF_TOKEN
  ? { Authorization: `Bearer ${HF_TOKEN}` }
  : {};

interface RowsResponse {
  rows: { row_idx: number; row: Record<string, unknown>; truncated_cells: string[] }[];
  num_rows_total: number;
}

function url(offset: number, length: number): string {
  const p = new URLSearchParams({
    dataset: DATASET.name,
    config: DATASET.config,
    split: DATASET.split,
    offset: String(offset),
    length: String(length),
  });
  return `${BASE}?${p.toString()}`;
}

async function fetchPage(offset: number, length: number): Promise<RowsResponse> {
  const res = await fetch(url(offset, length), { headers: authHeaders });
  if (!res.ok) {
    throw new Error(`datasets-server ${res.status} @offset=${offset}: ${await res.text()}`);
  }
  return (await res.json()) as RowsResponse;
}

/** Dataset boyunca esit araliklarla dagilmis pencere offset'leri (01-fetch ile ayni). */
function windowOffsets(total: number, target: number): number[] {
  if (total <= target) {
    const all: number[] = [];
    for (let o = 0; o < total; o += PAGE) all.push(o);
    return all;
  }
  const windows = Math.ceil(target / PAGE);
  const set = new Set<number>();
  for (let i = 0; i < windows; i++) {
    const o = Math.floor(((total - PAGE) * i) / (windows - 1));
    set.add(Math.max(0, o));
  }
  return [...set].sort((a, b) => a - b);
}

async function main(): Promise<void> {
  console.log(`[rag-fetch] ${DATASET.limit} kayit — ${DATASET.name} / ${DATASET.config}`);

  const first = await fetchPage(0, PAGE);
  const total = first.num_rows_total;
  const offsets = windowOffsets(total, DATASET.limit);
  console.log(`num_rows_total=${total} · stratified offsets: ${offsets.join(", ")}`);

  const pages = new Map<number, RowsResponse>();
  pages.set(0, first);
  for (const offset of offsets) {
    if (!pages.has(offset)) {
      pages.set(offset, await fetchPage(offset, PAGE));
      await new Promise((r) => setTimeout(r, 300)); // nazik ol
    }
  }

  const records: RagRawRecord[] = [];
  let truncated = 0;
  for (const offset of offsets) {
    const page = pages.get(offset)!;
    for (const item of page.rows) {
      if (records.length >= DATASET.limit) break;
      const r = item.row;
      // Baslik KIRPILMAZ; sadece RAG_TEXT_MAX_CHARS'a kesilir.
      const text = String(r.text ?? "").slice(0, RAG_TEXT_MAX_CHARS);
      if (item.truncated_cells?.includes("text")) truncated++;
      records.push({
        sourceId: String(r.id),
        text,
        year: r.year != null ? Number(r.year) : null,
        category: String(r.court ?? r.source ?? "unknown"),
        date: r.karar_tarihi != null ? String(r.karar_tarihi) : null,
      });
    }
    if (records.length >= DATASET.limit) break;
  }

  mkdirSync("data", { recursive: true });
  writeFileSync(RAG_DATA_FILE, JSON.stringify(records, null, 2), "utf8");

  const lens = records.map((r) => r.text.length);
  const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
  console.log(`\n[rag-fetch] ${records.length} kayit -> ${RAG_DATA_FILE}`);
  console.log(`metin uzunlugu: ort ${avg}, min ${Math.min(...lens)}, max ${Math.max(...lens)} karakter`);
  console.log(`datasets-server tarafindan kuyrugu kirpilmis metin: ${truncated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
