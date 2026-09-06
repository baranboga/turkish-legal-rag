import Link from "next/link";
import { CURRENT_RUN } from "@/config";

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vector Store Karsilastirma</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Aktif kosu: <span className="font-mono">{CURRENT_RUN}</span> &middot; kaynak:{" "}
          <span className="font-mono">results/{CURRENT_RUN}/</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/compare"
          className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="font-semibold">/compare</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Sorgu bazli sonuc karsilastirma. 2 provider x 3 mode = 6 kolon, top-5 sonuc,
            kacirilan/fazladan cikan sonuc isaretleme, filtre toggle.
          </p>
        </Link>
        <Link
          href="/metrics"
          className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <h2 className="font-semibold">/metrics</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Genel tablo: latency p50/p95, recall@5, index kurulum & embedding sureleri,
            OpenAI token/maliyet, sync testi sonucu.
          </p>
        </Link>
      </div>
    </div>
  );
}
