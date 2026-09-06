import OpenAI from "openai";
import { OPENAI_EMBEDDING_MODEL } from "../config";
import { requireEnv } from "../env";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

/** Tek istekte cok input embed eder. usage.total_tokens ile birlikte doner. */
export async function embedOpenAiBatch(
  inputs: string[]
): Promise<{ embeddings: number[][]; totalTokens: number }> {
  const res = await getClient().embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: inputs,
  });
  const embeddings = [...res.data]
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
  return { embeddings, totalTokens: res.usage?.total_tokens ?? 0 };
}

/** Arama tarafi: tek sorgu embedding'i (OpenAI'da prefix yok). */
export async function embedOpenAiQuery(text: string): Promise<number[]> {
  const { embeddings } = await embedOpenAiBatch([text]);
  return embeddings[0];
}
