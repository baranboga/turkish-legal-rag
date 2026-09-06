/**
 * Server-side env yardimcilari. Tum key'ler yalnizca server'da okunur.
 * Hicbir degisken NEXT_PUBLIC_ prefix'i almaz.
 */

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Eksik ortam degiskeni: ${name}. ".env.example" dosyasini ".env" olarak kopyalayip doldur.`
    );
  }
  return v.trim();
}

export function optionalEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}
