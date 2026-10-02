import { RAG_STRATEGIES, type RagStrategy } from "@/config";
import { ingestStrategy } from "@/rag/ingest";
import type { RagIngestEvent } from "@/rag/types";

// Canli ingest: cache yok, her zaman dinamik. (UI opsiyonel; CLI = npm run rag:ingest)
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * POST /api/rag/ingest  (NDJSON stream)
 * Bir chunking stratejisini ingest eder (chunk -> embed -> pgvector + HNSW).
 * Olaylar: progress* -> result | error. UI'dan tetiklenebilir; cok uzun surerse
 * CLI tercih edilir (npm run rag:ingest).
 */
export async function POST(req: Request): Promise<Response> {
  const { strategy } = (await req.json()) as { strategy?: string };
  if (!RAG_STRATEGIES.includes(strategy as RagStrategy)) {
    return new Response(JSON.stringify({ error: `Gecersiz strateji: ${strategy}` }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: RagIngestEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const result = await ingestStrategy(strategy as RagStrategy, (e) => send(e));
        send({ type: "result", result });
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
