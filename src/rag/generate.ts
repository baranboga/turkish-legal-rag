import "server-only";
import OpenAI from "openai";
import { RAG_CHAT_MODEL, chatPrice } from "../config";
import { requireEnv } from "../env";
import type { GenerationTiming } from "./types";

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

export interface GenerateResult {
  text: string;
  timing: GenerationTiming;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Cevabi STREAMING uretir. Her token delta'si onToken ile geri verilir (route
 * bunu client'a aktarir). stream_options.include_usage ile son chunk'ta gercek
 * token kullanimi gelir -> gercek maliyet (tahmin degil). temperature=0:
 * kaynaga sadik, tekrar uretilebilir cikti.
 */
export async function streamGenerate(
  messages: ChatMessage[],
  onToken: (delta: string) => void
): Promise<GenerateResult> {
  const model = RAG_CHAT_MODEL;
  const t0 = performance.now();

  const stream = await getClient().chat.completions.create({
    model,
    messages,
    temperature: 0,
    stream: true,
    stream_options: { include_usage: true },
  });

  let text = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      onToken(delta);
    }
    if (chunk.usage) {
      promptTokens = chunk.usage.prompt_tokens ?? 0;
      completionTokens = chunk.usage.completion_tokens ?? 0;
      totalTokens = chunk.usage.total_tokens ?? 0;
    }
  }

  const ms = Math.round((performance.now() - t0) * 100) / 100;
  const price = chatPrice(model);
  const costUsd =
    (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;

  return { text, timing: { ms, promptTokens, completionTokens, totalTokens, costUsd } };
}
