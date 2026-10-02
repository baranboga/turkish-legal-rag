import { readFileSync } from "node:fs";
import { stripDecisionHeader } from "./text";
import type { Query, RawRecord } from "./types";

/**
 * data/raw.json — Adim 1'de uretilir.
 * Okuma sirasinda her kaydin metnine ortak baslik kirpma (stripDecisionHeader)
 * uygulanir; boylece raw.json yeniden cekilmemis olsa bile embedding'e/DB'ye
 * giden metin konu bolumunden baslar. Idempotenttir (01-fetch zaten kirparsa
 * no-op). Not: mevcut documents tablosu zaten doluysa yeniden seed/embed
 * gerekir — eski metin DB'de kalir.
 */
export function loadRawRecords(): RawRecord[] {
  const records = JSON.parse(readFileSync("data/raw.json", "utf8")) as RawRecord[];
  return records.map((r) => ({ ...r, text: stripDecisionHeader(r.text) }));
}

/** data/queries.json — dondurulmus 10 sorgu. */
export function loadQueries(): Query[] {
  const parsed = JSON.parse(readFileSync("data/queries.json", "utf8")) as {
    queries: Query[];
  };
  return parsed.queries;
}
