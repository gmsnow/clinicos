import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function createClient() {
  let url = process.env.DATABASE_URL || "";
  if (url && process.env.VERCEL && url.includes(":6543")) {
    if (!url.includes("pgbouncer=")) {
      url = url.includes("?") ? `${url}&pgbouncer=true` : `${url}?pgbouncer=true`;
    }
  }
  // For Vercel, use transaction pooler settings
  const adapter = new PrismaPg({
    connectionString: url,
    max: 1,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter, log: [] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
