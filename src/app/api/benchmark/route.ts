import { runBenchmark } from "@/benchmark/core";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Canli benchmark: NDJSON stream. Tek uzun POST yerine ilerleme olaylari
 * (phase/progress) + son 'result' olayi yazilir; boylece UI dakikalarca
 * "takili" gorunmez. Sirali kosum — Promise.all YOK (bkz. core.runBenchmark).
 */
export async function POST(): Promise<Response> {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const data = await runBenchmark((e) => send(e));
        send({ type: "result", data });
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
