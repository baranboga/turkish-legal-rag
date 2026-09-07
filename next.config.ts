import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js App Router "index" adli sayfa klasorune izin vermiyor; sayfa
  // /indexer altinda, kullaniciya /index olarak servis edilir.
  async rewrites() {
    return [{ source: "/index", destination: "/indexer" }];
  },
};

export default nextConfig;
