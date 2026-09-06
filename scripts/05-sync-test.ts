/**
 * Adim 7 — Sync testi.
 *
 * documents tablosundan 5 kayit silinir. Silmeden ONCE ve SONRA, o kayitlari
 * HEDEFLEYEN sorgular (her kaydin kendi metni) uc modda da kosulur ve silinen
 * kayitlarin sonuclarda gorunup gorunmedigi raporlanir.
 *
 * EK TEMIZLIK KODU YOK: yalnizca documents'tan DELETE yapilir. Postgres FK
 * cascade pgvector embedding'lerini otomatik siler; Pinecone'a DOKUNULMAZ.
 * Amac varsayilan sync davranisini olcmek.
 *
 * Cikti: results/<run>/sync-test.md
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { MODES, resultsDir, type Mode } from "../src/config";
import { db, queryClient } from "../src/db/client";
import { documents } from "../src/db/schema";
import { embedQuery, runSearch } from "../src/search";

const PROVIDER = "openai" as const;
const TARGET_IDS = [10, 90, 170, 250, 330];

interface Target {
  id: number;
  sourceId: string;
  vector: number[];
}

/** Bir hedef icin: mode -> (varsa) rank (1-based), yoksa null. */
async function ranksFor(target: Target): Promise<Record<Mode, number | null>> {
  const out = {} as Record<Mode, number | null>;
  for (const mode of MODES) {
    const hits = await runSearch(target.vector, PROVIDER, mode);
    const idx = hits.findIndex((h) => h.documentId === target.id);
    out[mode] = idx >= 0 ? idx + 1 : null;
  }
  return out;
}

function rankCell(r: number | null): string {
  return r == null ? "-" : `#${r}`;
}

async function main(): Promise<void> {
  const rows = await db
    .select({ id: documents.id, sourceId: documents.sourceId, text: documents.text })
    .from(documents)
    .where(inArray(documents.id, TARGET_IDS));
  if (rows.length === 0) {
    throw new Error("Hedef kayitlar bulunamadi. Once `npm run embed` calistir.");
  }

  console.log(`Sync test: provider=${PROVIDER}, targets=${rows.map((r) => r.id).join(", ")}`);
  const targets: Target[] = [];
  for (const r of rows) {
    targets.push({ id: r.id, sourceId: r.sourceId, vector: await embedQuery(PROVIDER, r.text) });
  }

  const before = new Map<number, Record<Mode, number | null>>();
  for (const t of targets) before.set(t.id, await ranksFor(t));

  console.log(`Deleting ${targets.length} documents (cascade -> pgvector; Pinecone untouched)...`);
  await db.delete(documents).where(inArray(documents.id, TARGET_IDS));

  const after = new Map<number, Record<Mode, number | null>>();
  for (const t of targets) after.set(t.id, await ranksFor(t));

  // Ozet: her mod icin silindikten SONRA hala donen silinmis kayit sayisi
  const stillReturned: Record<Mode, number> = {} as Record<Mode, number>;
  for (const mode of MODES) {
    stillReturned[mode] = targets.filter((t) => after.get(t.id)![mode] != null).length;
  }

  mkdirSync(resultsDir(), { recursive: true });
  writeFileSync(`${resultsDir()}/sync-test.md`, renderSyncMd(targets, before, after, stillReturned), "utf8");
  console.log(`\nWrote ${resultsDir()}/sync-test.md`);
  console.log("after (silinen kayit hala donuyor mu):", stillReturned);
}

function renderSyncMd(
  targets: Target[],
  before: Map<number, Record<Mode, number | null>>,
  after: Map<number, Record<Mode, number | null>>,
  stillReturned: Record<Mode, number>
): string {
  const p: string[] = [];
  p.push(`# Sync testi — ${resultsDir().split("/").pop()}`);
  p.push(
    `provider: ${PROVIDER} · silinen document id: ${targets.map((t) => t.id).join(", ")}\n\n` +
      `Yalnizca documents tablosundan DELETE yapildi. Ek temizlik kodu yok. ` +
      `Sorgu = her kaydin kendi metni (kaydi hedefler).`
  );

  p.push(`\n## Detay — silinen kaydin kendi sorgusundaki rank'i (before / after)`);
  const head = ["docId", "sourceId", ...MODES.flatMap((m) => [`${m} (before)`, `${m} (after)`])];
  const sep = head.map(() => "---");
  const rows = targets.map((t) => {
    const b = before.get(t.id)!;
    const a = after.get(t.id)!;
    return [
      String(t.id),
      t.sourceId,
      ...MODES.flatMap((m) => [rankCell(b[m]), rankCell(a[m])]),
    ];
  });
  p.push(`| ${head.join(" | ")} |`);
  p.push(`| ${sep.join(" | ")} |`);
  for (const r of rows) p.push(`| ${r.join(" | ")} |`);

  p.push(`\n## Ozet — silindikten SONRA hala donen silinmis kayit sayisi (0..${targets.length})`);
  p.push(`| mode | silindikten sonra donen silinmis kayit |`);
  p.push(`| --- | --- |`);
  for (const m of MODES) p.push(`| ${m} | ${stillReturned[m]} |`);

  return p.join("\n") + "\n";
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => queryClient.end());
