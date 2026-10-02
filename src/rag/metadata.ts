/**
 * Karar metadata'si: karar no (Esas/Karar) + tarih.
 *
 * AYM kararlari ustte ortak bir kunye tasir; "Esas No." / "Esas Sayısı" ve
 * "Karar No." / "Karar Sayısı" alanlari bu kunyede gecer. Bu blok metnin EN
 * BASINDA oldugu icin (datasets-server uzun hucreleri kuyruktan kirpsa bile)
 * karar no guvenilir sekilde cikarilabilir. Saf fonksiyonlar — IO yok.
 */

/** "1962/ 7" -> "1962/7" (bosluklari temizle). */
function normPair(s: string): string {
  return s.replace(/\s+/g, "");
}

/**
 * "Esas" ve "Karar" numaralarini kunyeden cikarir. Donus: "E.1962/9 K.1962/3"
 * (hangisi bulunursa). Not: "Karar Günü"/"Karar tarihi" yanlis eslesmez cunku
 * desen yil/sira (\d{4}/\d+) formati arar; tarih formati buna uymaz.
 */
export function parseKararNo(text: string): string | null {
  const head = text.slice(0, 1200); // kunye hep bastadir
  const esasRe = /Esas\s*(?:Sayısı|No\.?|Numarası)?\s*[:.]?\s*(\d{4}\s*\/\s*\d+)/i;
  const kararRe = /Karar\s*(?:Sayısı|No\.?|Numarası)?\s*[:.]?\s*(\d{4}\s*\/\s*\d+)/i;

  const esas = head.match(esasRe)?.[1];
  const karar = head.match(kararRe)?.[1];

  const parts: string[] = [];
  if (esas) parts.push(`E.${normPair(esas)}`);
  if (karar) parts.push(`K.${normPair(karar)}`);
  return parts.length ? parts.join(" ") : null;
}

/** "5.9.1962" / "5/9/1962" -> "1962-09-05"; parse edilemezse null. */
function toIso(d: string): string | null {
  const m = d.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Karar tarihi (ISO). Oncelik kaydin `date` alanidir (karar_tarihi — guvenilir);
 * yoksa kunyedeki "Karar Günü/Tarihi" satirindan parse etmeye calisir.
 */
export function resolveTarih(recordDate: string | null, text: string): string | null {
  if (recordDate && /^\d{4}-\d{2}-\d{2}/.test(recordDate)) return recordDate.slice(0, 10);
  const m = text.slice(0, 1200).match(/Karar\s*(?:Günü|Tarihi|tarihi)\s*[:.]?\s*([\d./]+)/);
  return m ? toIso(m[1]) : null;
}
