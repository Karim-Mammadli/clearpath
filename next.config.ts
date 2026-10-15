import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and DB-backed, so we use plain dynamic rendering
  // instead of Cache Components / PPR.
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    // Optional image creatives (≤ 3MB, validated server-side) are uploaded through server actions.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
