/**
 * Prompt insasi. Saf fonksiyon — IO yok. Hem /api/rag/chat hem debug paneli
 * ayni ciktidan beslenir (kullaniciya gosterilen "modele giden tam prompt" =
 * burada uretilen system + user).
 */
import type { RagSource } from "./types";

/** Kaynaklarda cevap yoksa model AYNEN bunu yazmali. */
export const NO_ANSWER = "Bu soruya verilen kararlarda cevap bulamadım.";

export const SYSTEM_PROMPT = [
  "Sen Türk anayasa hukuku kararları üzerinde çalışan bir hukuk asistanısın.",
  "Soruyu YALNIZCA aşağıda sana verilen KAYNAKLAR'a (karar alıntıları) dayanarak yanıtla.",
  "",
  "Kurallar:",
  "1. Yalnızca verilen kaynaklardaki bilgiyi kullan. Kendi genel bilgini, kaynaklarda",
  "   geçmeyen hiçbir şeyi EKLEME; bilgi uydurma.",
  "2. Her iddianın sonunda dayandığın kaynağı köşeli parantezle göster: [1], [2] gibi.",
  "   Birden çok kaynak destekliyorsa [1][3] şeklinde birden çok numara yaz.",
  `3. Kaynaklarda sorunun cevabı YOKSA, başka hiçbir şey yazmadan tam olarak şunu yaz: "${NO_ANSWER}"`,
  "4. Türkçe, açık ve öz yanıtla. Kaynak numaralarını uydurma; yalnızca verilen",
  "   numaraları kullan.",
].join("\n");

/** Kaynaklari numarali blok olarak bicimlendirir (metadata + chunk metni). */
function formatSources(sources: RagSource[]): string {
  if (sources.length === 0) return "(Kaynak bulunamadı.)";
  return sources
    .map((s) => {
      const meta = [
        s.kararNo ? `karar no: ${s.kararNo}` : null,
        s.tarih ? `tarih: ${s.tarih}` : null,
        s.bolum && s.bolum !== "—" ? `bölüm: ${s.bolum}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const header = meta ? `[${s.n}] (${meta})` : `[${s.n}]`;
      return `${header}\n${s.text.trim()}`;
    })
    .join("\n\n");
}

export function buildUserPrompt(query: string, sources: RagSource[]): string {
  return [
    `SORU:\n${query.trim()}`,
    "",
    `KAYNAKLAR:\n${formatSources(sources)}`,
    "",
    "Yukarıdaki kaynaklara dayanarak soruyu yanıtla ve her iddianı [n] ile ilgili",
    "kaynağa bağla. Cevap kaynaklarda yoksa kuralda belirtilen cümleyi yaz.",
  ].join("\n");
}

export interface BuiltPrompt {
  system: string;
  user: string;
  messages: { role: "system" | "user"; content: string }[];
}

export function buildPrompt(query: string, sources: RagSource[]): BuiltPrompt {
  const system = SYSTEM_PROMPT;
  const user = buildUserPrompt(query, sources);
  return {
    system,
    user,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}
