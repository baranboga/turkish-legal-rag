import type { Metadata } from "next";
import Link from "next/link";
import { CURRENT_RUN } from "@/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turkish Legal RAG — Vector Store Karsilastirma",
  description: "pgvector (exact/HNSW) vs Pinecone, OpenAI vs HF embedding karsilastirmasi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">
              turkish-legal-rag
            </Link>
            <Link href="/index" className="hover:underline">
              /index
            </Link>
            <Link href="/search" className="hover:underline">
              /search
            </Link>
            <Link href="/benchmark" className="hover:underline">
              /benchmark
            </Link>
            <Link href="/chat" className="hover:underline">
              /chat
            </Link>
            <span className="ml-auto rounded bg-neutral-100 px-2 py-1 font-mono text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              run: {CURRENT_RUN}
            </span>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
