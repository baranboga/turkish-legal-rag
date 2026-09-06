/**
 * Adim 1 — Veri cekme.
 *
 * hamzabagirsakci/turkish-court-decisions veri setinin `aym_norm` split'inden
 * 400 kayit ceker (tum dataset degil). HF datasets-server REST endpoint'i
 * publictir, token gerektirmez.
 *
 * Chunking YOK: her kararin ilk 2000 karakteri `text` olarak alinir.
 *
 * Yil cesitliligi (yearGte=2019 filtre testinin anlamli olmasi) icin dataset
 * boyunca 4 pencereden (her biri 100 kayit) STRATIFIED ornekleme yapilir;
 * boylece hem eski hem yeni yillar temsil edilir. Ham cikti data/raw.json.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { DATASET } from "../src/config";
import type { RawRecord } from "../src/types";

const BASE = "https://datasets-server.huggingface.co/rows";
const PAGE = 100;

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
  const res = await fetch(url(offset, length));
  if (!res.ok) {
    throw new Error(`datasets-server ${res.status} @offset=${offset}: ${await res.text()}`);
  }
  return (await res.json()) as RowsResponse;
}

/** Dataset boyunca esit araliklarla dagilmis pencere baslangic offset'leri. */
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
  console.log(`Fetching ${DATASET.limit} records from ${DATASET.name} / ${DATASET.config}`);

  // Ilk sayfa: hem toplam sayiyi hem ilk pencereyi verir.
  const first = await fetchPage(0, PAGE);
  const total = first.num_rows_total;
  console.log(`num_rows_total = ${total}`);

  const offsets = windowOffsets(total, DATASET.limit);
  console.log(`stratified window offsets: ${offsets.join(", ")}`);

  const pages = new Map<number, RowsResponse>();
  pages.set(0, first);
  for (const offset of offsets) {
    if (!pages.has(offset)) {
      pages.set(offset, await fetchPage(offset, PAGE));
      await new Promise((r) => setTimeout(r, 300)); // nazik ol
    }
  }

  const records: RawRecord[] = [];
  let truncatedText = 0;
  let shortText = 0;
  for (const offset of offsets) {
    const page = pages.get(offset)!;
    for (const item of page.rows) {
      if (records.length >= DATASET.limit) break;
      const r = item.row;
      const text = String(r.text ?? "").slice(0, DATASET.textMaxChars);
      if (item.truncated_cells?.includes("text")) truncatedText++;
      if (text.length < DATASET.textMaxChars) shortText++;
      records.push({
        sourceId: String(r.id),
        text,
        year: r.year != null ? Number(r.year) : null,
        // court cogu satirda null; kategori icin source'a dus (non-null kalir).
        category: String(r.court ?? r.source ?? "unknown"),
        date: r.karar_tarihi != null ? String(r.karar_tarihi) : null,
        month: r.month != null ? Number(r.month) : null,
      });
    }
    if (records.length >= DATASET.limit) break;
  }

  mkdirSync("data", { recursive: true });
  writeFileSync("data/raw.json", JSON.stringify(records, null, 2), "utf8");

  // Ozet / dogrulama ciktilari
  const years = records
    .map((r) => r.year)
    .filter((y): y is number => y != null)
    .sort((a, b) => a - b);
  const gte2019 = records.filter((r) => (r.year ?? 0) >= 2019).length;
  const cats = new Map<string, number>();
  for (const r of records) cats.set(r.category, (cats.get(r.category) ?? 0) + 1);

  console.log(`\nWrote ${records.length} records -> data/raw.json`);
  console.log(`year range: ${years[0]} .. ${years[years.length - 1]}`);
  console.log(`records with year >= 2019: ${gte2019}`);
  console.log(`text shorter than ${DATASET.textMaxChars} chars: ${shortText}`);
  console.log(`text truncated by datasets-server: ${truncatedText}`);
  console.log(`category distribution:`, Object.fromEntries(cats));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
