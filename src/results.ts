import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURRENT_RUN } from "./config";
import type { BenchmarkFile } from "./types";

/**
 * UI veri kaynagi: yalnizca results/<CURRENT_RUN>/benchmark.json ve
 * sync-test.md. UI DB'ye baglanmaz, canli sorgu atmaz.
 */
function runDir(): string {
  return join(process.cwd(), "results", CURRENT_RUN);
}

export function loadBenchmark(): BenchmarkFile | null {
  try {
    return JSON.parse(readFileSync(join(runDir(), "benchmark.json"), "utf8")) as BenchmarkFile;
  } catch {
    return null;
  }
}

export function loadSyncTestMd(): string | null {
  try {
    return readFileSync(join(runDir(), "sync-test.md"), "utf8");
  } catch {
    return null;
  }
}

/** sync-test.md ozet tablosundan mode -> (silindikten sonra donen kayit sayisi). */
export function parseSyncSummary(md: string): { mode: string; count: number }[] {
  const modes = ["pgvector-exact", "pgvector-hnsw", "pinecone"];
  const out: { mode: string; count: number }[] = [];
  for (const mode of modes) {
    const re = new RegExp(`\\|\\s*${mode}\\s*\\|\\s*(\\d+)\\s*\\|`);
    const m = md.match(re);
    if (m) out.push({ mode, count: Number(m[1]) });
  }
  return out;
}
