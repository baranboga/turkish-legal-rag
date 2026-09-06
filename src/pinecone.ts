import { Pinecone } from "@pinecone-database/pinecone";
import { requireEnv } from "./env";

let pc: Pinecone | null = null;

/** Paylasilan Pinecone client (setup script + search katmani kullanir). */
export function getPinecone(): Pinecone {
  if (!pc) pc = new Pinecone({ apiKey: requireEnv("PINECONE_API_KEY") });
  return pc;
}
