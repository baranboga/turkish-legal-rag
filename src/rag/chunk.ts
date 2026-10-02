/**
 * Chunking — iki strateji (kasitli olarak NAIVE):
 *   a) chunkFixed:      ~500 token kayan pencere, 50 token overlap.
 *   b) chunkStructure:  kararin kendi bolum basliklarina gore boler; baslik
 *                       bulunamazsa recursive fixed-size fallback. Buyuk bolumler
 *                       de icinde fixed-size'a duser.
 *
 * Token sayaci: gercek tokenizer yerine karakter yaklasikligi (RAG_CHARS_PER_TOKEN)
 * — ek bagimlilik yok, naive. Maliyet RAPORLAMASI API'nin gercek usage'ini kullanir.
 * Saf fonksiyonlar — IO yok, test edilebilir.
 */
import {
  FIXED_CHUNK_OVERLAP_TOKENS,
  FIXED_CHUNK_TOKENS,
  RAG_CHARS_PER_TOKEN,
  STRUCTURE_MAX_SECTION_TOKENS,
} from "../config";
import { parseKararNo, resolveTarih } from "./metadata";
import type { Chunk } from "./types";

/** chunk() girdisi — data/rag-raw.json'daki ham karar. */
export interface RawDecision {
  sourceId: string;
  text: string;
  date: string | null;
}

const tokensToChars = (t: number) => Math.round(t * RAG_CHARS_PER_TOKEN);
const estTokens = (chars: number) => Math.round(chars / RAG_CHARS_PER_TOKEN);

/** Kayan pencere char-chunking (hem fixed hem buyuk-bolum bolme kullanir). */
function windowChunks(text: string, sizeChars: number, overlapChars: number): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= sizeChars) return [clean];
  const step = Math.max(1, sizeChars - overlapChars);
  const out: string[] = [];
  for (let start = 0; start < clean.length; start += step) {
    const piece = clean.slice(start, start + sizeChars).trim();
    if (piece) out.push(piece);
    if (start + sizeChars >= clean.length) break;
  }
  return out;
}

function makeChunk(
  d: RawDecision,
  kararNo: string | null,
  tarih: string | null,
  bolum: string,
  chunkIndex: number,
  text: string
): Chunk {
  return {
    sourceId: d.sourceId,
    kararNo,
    tarih,
    bolum,
    chunkIndex,
    tokenEstimate: estTokens(text.length),
    text,
  };
}

// ---------------------------------------------------------------------------
// a) fixed-size
// ---------------------------------------------------------------------------

/** Kunyeden sonraki govdenin baslangic index'i (ortak baslik gurultusu azalir). */
const BODY_MARKERS = [
  "İSTEMİN KONUSU",
  "İTİRAZIN KONUSU",
  "İPTAL DAVASININ KONUSU",
  "DAVANIN KONUSU",
  "BAŞVURUNUN KONUSU",
  "TALEBİN KONUSU",
];

function findBodyStart(text: string): number {
  let cut = -1;
  const upper = text.toLocaleUpperCase("tr");
  for (const m of BODY_MARKERS) {
    const idx = upper.indexOf(m);
    if (idx !== -1 && (cut === -1 || idx < cut)) cut = idx;
  }
  return cut === -1 ? 0 : cut;
}

export function chunkFixed(d: RawDecision): Chunk[] {
  const kararNo = parseKararNo(d.text);
  const tarih = resolveTarih(d.date, d.text);
  const body = d.text.slice(findBodyStart(d.text));
  const pieces = windowChunks(
    body,
    tokensToChars(FIXED_CHUNK_TOKENS),
    tokensToChars(FIXED_CHUNK_OVERLAP_TOKENS)
  );
  return pieces.map((text, i) => makeChunk(d, kararNo, tarih, "—", i, text));
}

// ---------------------------------------------------------------------------
// b) structure-aware
// ---------------------------------------------------------------------------

/**
 * AYM kararlarinda gecen bolum basliklari (Turkce buyuk harf formunda).
 * YALNIZCA bu liste bir satiri "baslik" yapar — genel "ALL-CAPS satir = baslik"
 * sezgisi KASITLI KULLANILMAZ: imza blogundaki buyuk harfli soyadlari
 * (GERÇEKER, AKÇOĞLU...) ya da kunye baslik satiri yanlis bolum uretiyordu.
 * Listede olmayan bir baslik, onceki bolume dahil edilir (uydurma bolum yok).
 *
 * Siralama onemli: uzun/ozel marker'lar kisa prefix'lerinden ONCE gelir
 * (ornek: "OLAY VE OLGULAR" -> "OLAYLAR" -> "OLAY") cunku ilk eslesme kazanir.
 * "KARAR" bilerek YOK (kunyedeki "Karar Sayısı/Günü" satirlarini yakalardi).
 */
const SECTION_MARKERS = [
  // konu
  "İPTAL DAVASININ KONUSU",
  "BAŞVURUNUN KONUSU",
  "İTİRAZIN KONUSU",
  "DAVANIN KONUSU",
  "TALEBİN KONUSU",
  "İSTEMİN KONUSU",
  // taraf / basvuru
  "İTİRAZ YOLUNA BAŞVURAN",
  "İSTEMDE BULUNAN",
  "BAŞVURU SÜRECİ",
  "BAŞVURU KARARI",
  // olay
  "OLAY VE OLGULAR",
  "OLAYLAR",
  "OLAY",
  // ilgili hukuk
  "ULUSLARARASI HUKUK",
  "UYGULANACAK HUKUK",
  "İLGİLİ HUKUK",
  // gerekce / inceleme
  "İTİRAZIN GEREKÇESİ",
  "İSTEMİN GEREKÇESİ",
  "İNCELEME VE GEREKÇE",
  "ESASIN İNCELENMESİ",
  "KABUL EDİLEBİLİRLİK",
  "ESAS YÖNÜNDEN",
  "İLK İNCELEME",
  "İNCELEME",
  "DEĞERLENDİRME",
  "GEREKÇE",
  // sonuc
  "HÜKÜM",
  "SONUÇ",
];

/** Satir basindaki numaralandiriciyi (I. / A. / 1. / 1)) atar. */
function stripEnumerator(t: string): string {
  return t.replace(/^\(?\s*(?:[IVXLCDM]+|[A-ZÇĞİÖŞÜ]|\d+)\s*[.)\-–]\s*/u, "").trim();
}

/**
 * Bir satir bolum basligi mi? Donus: bolum adi (marker) ya da null. Satir bilinen
 * bir marker ile baslarsa (opsiyonel numaralandirici atildiktan sonra; title-case
 * ya da ALL-CAPS fark etmez — icerik ayni satirda devam etse bile) marker bolum
 * adi olur.
 */
function headingBolum(line: string): string | null {
  const t = line.trim();
  if (t.length < 2) return null;
  const rest = stripEnumerator(t);
  if (!rest) return null;
  const upper = rest.toLocaleUpperCase("tr");
  return SECTION_MARKERS.find((m) => upper.startsWith(m)) ?? null;
}

/** Metni tespit edilen basliklara gore bolumlere ayirir; baslik yoksa []. */
function splitSections(text: string): { bolum: string; text: string }[] {
  const lines = text.split(/\r?\n/);
  const marks: { i: number; bolum: string }[] = [];
  lines.forEach((l, i) => {
    const b = headingBolum(l);
    if (b) marks.push({ i, bolum: b });
  });
  if (marks.length === 0) return [];

  const sections: { bolum: string; text: string }[] = [];
  if (marks[0].i > 0) {
    const kunye = lines.slice(0, marks[0].i).join("\n").trim();
    if (kunye) sections.push({ bolum: "Künye", text: kunye });
  }
  for (let k = 0; k < marks.length; k++) {
    const start = marks[k].i;
    const end = k + 1 < marks.length ? marks[k + 1].i : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    if (body) sections.push({ bolum: marks[k].bolum, text: body });
  }
  return sections;
}

export function chunkStructure(d: RawDecision): Chunk[] {
  const sections = splitSections(d.text);
  if (sections.length === 0) return chunkFixed(d); // baslik yok -> recursive fallback

  const kararNo = parseKararNo(d.text);
  const tarih = resolveTarih(d.date, d.text);
  const size = tokensToChars(STRUCTURE_MAX_SECTION_TOKENS);
  const overlap = tokensToChars(FIXED_CHUNK_OVERLAP_TOKENS);

  const chunks: Chunk[] = [];
  let idx = 0;
  for (const sec of sections) {
    // Cok buyuk bolum -> icinde fixed-size'a dus (recursive fallback).
    const pieces =
      estTokens(sec.text.length) > STRUCTURE_MAX_SECTION_TOKENS
        ? windowChunks(sec.text, size, overlap)
        : [sec.text.trim()];
    for (const piece of pieces) {
      if (piece) chunks.push(makeChunk(d, kararNo, tarih, sec.bolum, idx++, piece));
    }
  }
  return chunks.length ? chunks : chunkFixed(d);
}

/** Strateji -> chunker. */
export function chunkDecision(d: RawDecision, strategy: "fixed" | "structure"): Chunk[] {
  return strategy === "fixed" ? chunkFixed(d) : chunkStructure(d);
}
