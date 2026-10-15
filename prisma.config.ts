import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI config (migrations + seed). Migrations use the direct (unpooled) Neon URL;
// the app itself connects through the pooled URL (see src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not required for `prisma generate` (e.g. during the Vercel build).
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
  },
});
