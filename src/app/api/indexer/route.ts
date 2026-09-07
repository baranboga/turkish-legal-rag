import { indexCombo } from "@/benchmark/core";

// Canli indexleme: cache yok, her zaman dinamik. (Client /api/indexer'a POST eder.)
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: Request): Promise<Response> {
  const { comboId } = (await req.json()) as { comboId: string };
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await indexCombo(comboId, (e) => send(e));
        send({ type: "result", result });
      } catch (e) {
        // Hata yutulmaz — ham mesaj stream'e yazilir.
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
