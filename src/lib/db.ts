import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";

// Pooled Neon URL for the app. Migrations use DATABASE_URL_UNPOOLED (prisma.config.ts).
// Fallback names cover the variants the Vercel/Neon integration can create.
function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: connectionString() }) });
  }
  return globalForPrisma.prisma;
}

/**
 * Lazily-connected Prisma client: nothing touches the database (or its env vars) until the first
 * query, so `next build` works without database credentials.
 */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const c = client();
    const value = Reflect.get(c, prop, c);
    return typeof value === "function" ? value.bind(c) : value;
  },
});
