import {
  HF_EMBEDDING_DIM,
  HF_EMBEDDING_MODEL,
  HF_PASSAGE_PREFIX,
  HF_QUERY_PREFIX,
} from "../config";
import { requireEnv } from "../env";

const ROUTER = `https://router.huggingface.co/hf-inference/models/${HF_EMBEDDING_MODEL}/pipeline/feature-extraction`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function meanPool(tokens: number[][]): number[] {
  const dim = tokens[0].length;
  const out = new Array<number>(dim).fill(0);
  for (const t of tokens) for (let i = 0; i < dim; i++) out[i] += t[i];
  for (let i = 0; i < dim; i++) out[i] /= tokens.length;
  return out;
}

/**
 * feature-extraction ciktisini her zaman `number[][]` (input basina bir vektor)
 * haline getirir. Sentence-transformers modelleri 2B pooled vektor doner; token
 * seviyesi (3B ya da tek input icin 2B) gelirse mean-pooling uygulanir.
 */
function normalizeVectors(data: unknown, n: number): number[][] {
  const arr = data as number[] | number[][] | number[][][];
  if (typeof (arr as number[])[0] === "number") {
    return [arr as number[]]; // 1B: tek cumle vektoru
  }
  const two = arr as number[][];
  if (typeof (two[0] as unknown as number[])[0] === "number") {
    // 2B
    if (n === 1) {
      if (two.length === 1 && two[0].length === HF_EMBEDDING_DIM) return two;
      return [meanPool(two)]; // tek input icin token embedding'leri
    }
    return two; // cok input icin cumle vektorleri listesi
  }
  // 3B: input basina token embedding matrisi
  return (arr as number[][][]).map(meanPool);
}

async function featureExtraction(inputs: string[], attempt = 0): Promise<number[][]> {
  const res = await fetch(ROUTER, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("HF_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs, options: { wait_for_model: true } }),
  });

  // Model yukleniyor (503) veya rate limit (429): backoff ile tekrar dene.
  if ((res.status === 503 || res.status === 429) && attempt < 5) {
    const wait = Math.min(2000 * 2 ** attempt, 20000);
    await sleep(wait);
    return featureExtraction(inputs, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`HF feature-extraction ${res.status}: ${await res.text()}`);
  }

  const vectors = normalizeVectors(await res.json(), inputs.length);
  for (const v of vectors) {
    if (v.length !== HF_EMBEDDING_DIM) {
      throw new Error(
        `HF vektor boyutu ${v.length}, beklenen ${HF_EMBEDDING_DIM}. ` +
          `HF_EMBEDDING_DIM ile model uyusmuyor (model: ${HF_EMBEDDING_MODEL}).`
      );
    }
  }
  return vectors;
}

/** Dokumanlar icin: passage prefix uygula, embed et. */
export function embedHfPassages(texts: string[]): Promise<number[][]> {
  return featureExtraction(texts.map((t) => HF_PASSAGE_PREFIX + t));
}

/** Arama tarafi: query prefix uygula, tek vektor don. */
export async function embedHfQuery(text: string): Promise<number[]> {
  const [v] = await featureExtraction([HF_QUERY_PREFIX + text]);
  return v;
}
