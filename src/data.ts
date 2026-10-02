import { readFileSync } from "node:fs";
import { RAG_DATA_FILE } from "./config";
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

/**
 * RAG ham kayitlari — data/rag-raw.json (npm run rag:fetch).
 * benchmark'in raw.json'undan FARKLI: ortak baslik KIRPILMAZ ve metin daha uzun
 * tutulur (chunking + karar no metadata'si icin). Dosya yoksa acik hata verir.
 */
export interface RagRawRecord {
  sourceId: string;
  text: string;
  date: string | null;
  year: number | null;
  category: string;
}

export function loadRagRecords(): RagRawRecord[] {
  // Once RAG'a ozel dosya (rag-raw.json: baslik kirpilmamis, uzun metin).
  // Yoksa benchmark'in raw.json'una dus (baslik kirpik + 2000 char ama ayni 400
  // karar; karar no yine ~391/400 cikar). rag-raw.json dataset gated/erisilmezse
  // bu fallback RAG'i calisir tutar.
  for (const file of [RAG_DATA_FILE, "data/raw.json"]) {
    try {
      const recs = JSON.parse(readFileSync(file, "utf8")) as RagRawRecord[];
      if (file !== RAG_DATA_FILE) {
        console.warn(
          `[rag] ${RAG_DATA_FILE} bulunamadi; ${file} kullaniliyor (metin 2000 char, baslik kirpik).`
        );
      }
      return recs;
    } catch {
      /* sonraki dosyayi dene */
    }
  }
  throw new Error(
    `Ne ${RAG_DATA_FILE} ne data/raw.json okunabildi. "npm run rag:fetch" veya "npm run fetch" calistir.`
  );
}
