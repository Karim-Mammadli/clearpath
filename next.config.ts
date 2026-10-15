import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and DB-backed, so we use plain dynamic rendering
  // instead of Cache Components / PPR.
  cacheComponents: false,
  partialPrefetching: false,
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
