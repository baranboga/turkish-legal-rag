import { loadBenchmark } from "@/results";
import EmptyState from "../_components/EmptyState";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  const b = loadBenchmark();
  if (!b) return <EmptyState />;
  return <CompareClient data={b} />;
}
