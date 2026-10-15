import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page here is per-user and DB-backed, so we use plain dynamic rendering
  // instead of Cache Components / PPR.
  cacheComponents: false,
  partialPrefetching: false,
  experimental: {
    // Image creatives (up to 5MB chosen, resized in the browser to ≤3.5MB, re-validated server-side) go through server actions.
    serverActions: { bodySizeLimit: "4.5mb" },
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
