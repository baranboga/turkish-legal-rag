import { RAG_CHAT_MODEL, RAG_STRATEGIES, type RagStrategy } from "@/config";
import { streamGenerate } from "@/rag/generate";
import { buildPrompt } from "@/rag/prompt";
import { clampTopK, retrieve } from "@/rag/retrieve";
import type { ChatEvent, RagSource } from "@/rag/types";

// Canli RAG: cache yok, her zaman dinamik.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * POST /api/rag/chat  (NDJSON stream)
 * Naive RAG pipeline — her adim ayri okunabilir cagri:
 *   retrieve() -> buildPrompt() -> streamGenerate()
 * Olaylar: meta (kaynaklar + retrieval latency + tam prompt) -> token* -> done
 * (generation latency + gercek token/maliyet). Hatalar yutulmaz: error olayi.
 */
export async function POST(req: Request): Promise<Response> {
  const body = (await req.json()) as { query?: string; strategy?: string; topK?: number };
  const query = (body.query ?? "").trim();
  const strategy: RagStrategy = RAG_STRATEGIES.includes(body.strategy as RagStrategy)
    ? (body.strategy as RagStrategy)
    : "structure";
  const topK = clampTopK(body.topK);

  if (!query) {
    return new Response(JSON.stringify({ error: "Bos sorgu" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        // 1) retrieve
        const { hits, timing } = await retrieve(query, strategy, topK);
        const sources: RagSource[] = hits.map((h, i) => ({ ...h, n: i + 1 }));

        // 2) buildPrompt
        const prompt = buildPrompt(query, sources);

        // meta: kaynaklar + retrieval suresi + modele giden tam prompt
        send({
          type: "meta",
          model: RAG_CHAT_MODEL,
          strategy,
          topK,
          sources,
          retrieval: timing,
          prompt: { system: prompt.system, user: prompt.user },
        });

        // 3) generate (streaming)
        const { timing: gen } = await streamGenerate(prompt.messages, (delta) =>
          send({ type: "token", text: delta })
        );

        const totalCostUsd = timing.queryCostUsd + gen.costUsd;
        send({ type: "done", generation: gen, totalCostUsd });
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
