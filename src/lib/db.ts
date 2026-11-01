import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function resolveConnectionString(raw: string): string {
  if (!raw || !process.env.VERCEL) return raw;
  if (!/\.pooler\.supabase\.com/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    if (url.port === "5432") url.port = "6543";
    if (!url.searchParams.has("pgbouncer")) url.searchParams.set("pgbouncer", "true");
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    return url.toString();
  } catch {
    return raw;
  }
}

function createClient() {
  const adapter = new PrismaPg({
    connectionString: resolveConnectionString(process.env.DATABASE_URL || ""),
    max: 1,
    idleTimeoutMillis: 0,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  return new PrismaClient({ adapter, log: [] });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

if (typeof process !== "undefined") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}
