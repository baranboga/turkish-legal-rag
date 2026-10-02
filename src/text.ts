/**
 * Karar metni on-isleme.
 *
 * AYM kararlari ortak bir baslik bloguyla baslar: "ANAYASA MAHKEMESI KARARI",
 * Esas/Karar Sayisi, Karar Tarihi, R.G. Tarih-Sayi ve "ITIRAZ YOLUNA
 * BASVURAN ...". Bu blok neredeyse tum kararlarda aynidir; embedding'leri
 * birbirine yakinlastirir ve ayirt ediciligi dusurur (arama sonuclari hep ayni
 * basligi gosterir). Gercek konu norm denetiminde "ITIRAZIN KONUSU", iptal
 * davasinda "IPTAL DAVASININ KONUSU" bolumunde baslar; metni oradan itibaren
 * alarak ortak baslik kirpilir. Chunking'e gecilene kadarki ara adim.
 */

/** Konu bolumunu isaret eden basliklar (ilk gecen kullanilir). */
const HEADER_END_MARKERS = [
  "İTİRAZIN KONUSU",
  "İPTAL DAVASININ KONUSU",
  "DAVANIN KONUSU",
] as const;

/**
 * Ortak baslik blogunu kirpar: metni ilk gecen "... KONUSU" bolum basligindan
 * itibaren dondurur. Hicbir marker bulunamazsa metni DEGISTIRMEDEN dondurur
 * (her kararda bu basliklar olmayabilir). Idempotenttir: zaten kirpilmis metin
 * (marker index 0) aynen geri doner.
 */
export function stripDecisionHeader(text: string): string {
  let cut = -1;
  for (const marker of HEADER_END_MARKERS) {
    const idx = text.indexOf(marker);
    if (idx !== -1 && (cut === -1 || idx < cut)) cut = idx;
  }
  return cut === -1 ? text : text.slice(cut);
}
