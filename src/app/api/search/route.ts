import { NextResponse } from "next/server";
import { COMBOS } from "@/benchmark/combos";
import { getDocTextMap, runSingleSearch } from "@/benchmark/core";
import type { SearchComboResult } from "@/benchmark/api-types";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: Request): Promise<Response> {
  const { query } = (await req.json()) as { query: string };
  if (!query || !query.trim()) {
    return NextResponse.json({ error: "Bos sorgu" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const docText = await getDocTextMap();
  const results: SearchComboResult[] = [];
  // Sirali — Promise.all YOK.
  for (const combo of COMBOS) {
    results.push(await runSingleSearch(query, combo, docText));
  }

  return NextResponse.json({ query, results }, { headers: { "Cache-Control": "no-store" } });
}
