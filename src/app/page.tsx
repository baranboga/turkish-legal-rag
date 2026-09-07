import Link from "next/link";
import { CURRENT_RUN } from "@/config";

const cards = [
  {
    href: "/index",
    title: "/index",
    desc: "Kombinasyon başına indexleme (400 doküman embed + store). Progress, süre, token sayısı — hepsi server-side.",
  },
  {
    href: "/search",
    title: "/search",
    desc: "Tek sorgu, 2×2 grid (2 store × 2 provider). Top-5 sonuç, 4 haneli skor, embed/search/total latency.",
  },
  {
    href: "/benchmark",
    title: "/benchmark",
    desc: "Sabit sorgu seti, sıralı koşum, p50/p95/ortalama tablosu, top-5 örtüşme paneli, tahmin formu, JSON export.",
  },
];

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Vector Store Benchmark</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          4 kombinasyon: pgvector+OpenAI, pgvector+HF, Pinecone+OpenAI, Pinecone+HF ·{" "}
          <span className="font-mono">{CURRENT_RUN}</span>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Ölçüm server-side · cache yok · sorgular sıralı · ilk istek warm-up · sayfalar mount&apos;ta
          otomatik koşmaz.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="block rounded-lg border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h2 className="font-mono font-semibold">{c.title}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
