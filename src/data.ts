import { readFileSync } from "node:fs";
import type { Query, RawRecord } from "./types";

/** data/raw.json — Adim 1'de uretilir. */
export function loadRawRecords(): RawRecord[] {
  return JSON.parse(readFileSync("data/raw.json", "utf8")) as RawRecord[];
}

/** data/queries.json — dondurulmus 10 sorgu. */
export function loadQueries(): Query[] {
  const parsed = JSON.parse(readFileSync("data/queries.json", "utf8")) as {
    queries: Query[];
  };
  return parsed.queries;
}
