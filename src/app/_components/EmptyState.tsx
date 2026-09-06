import { CURRENT_RUN } from "@/config";

export default function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="text-lg font-semibold">
        Bu kosu icin sonuc dosyasi yok: <span className="font-mono">{CURRENT_RUN}</span>
      </h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        UI yalnizca <span className="font-mono">results/{CURRENT_RUN}/benchmark.json</span> ve{" "}
        <span className="font-mono">sync-test.md</span> dosyalarini okur; canli sorgu atmaz. Once
        pipeline&apos;i calistir:
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-neutral-100 p-3 text-xs text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
        {`# .env dolduruldiktan sonra:
npm run verify:db      # (dogrulama) pgvector surumu + HNSW destegi
npm run fetch          # data/raw.json (public, key gerekmez)
npm run db:migrate     # tablolar (DIRECT_URL / 5432)
npm run embed          # OpenAI + HF embedding -> Postgres
npm run pinecone       # iki index olustur + upsert
npm run benchmark      # results/${CURRENT_RUN}/benchmark.json + .md
npm run sync-test      # results/${CURRENT_RUN}/sync-test.md`}
      </pre>
    </div>
  );
}
