import { loadIndexStats } from "@/benchmark/core";
import IndexClient from "./IndexClient";

// URL /index -> next.config.ts rewrite ile buraya (/indexer) yonlenir.
// (Next.js App Router "index" adli klasore izin vermiyor.)
export const dynamic = "force-dynamic";

export default function IndexPage() {
  // Kayitli index sonuclarini oku (results/<run>/index-stats.json).
  // Bu bir benchmark KOSUMU degil, sadece diskteki veriyi gostermek — kural ihlali yok.
  const saved = loadIndexStats();
  return <IndexClient initial={saved} />;
}
