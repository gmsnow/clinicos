import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/core/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const out: Record<string, unknown> = {
    env: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      databaseUrlHost: (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@").split("?")[0],
      databaseUrlQuery: (process.env.DATABASE_URL ?? "").split("?")[1] ?? null,
      hasAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET),
      authSecretLength: (process.env.BETTER_AUTH_SECRET ?? "").length,
      authUrl: process.env.BETTER_AUTH_URL ?? null,
      vercelUrl: process.env.VERCEL_URL ?? null,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL ?? null,
    },
  };

  try {
    const r = await prisma.$queryRaw<{ now: Date }[]>`select now() as now`;
    out.db = { ok: true, now: r[0]?.now };
  } catch (e) {
    out.db = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  try {
    const r = await auth.api.signInUsername({
      body: { username: "admin", password: "admin" },
      headers: new Headers({ origin: "https://clinicos-business1.vercel.app" }),
    });
    out.auth = { ok: true, user: r.user?.username, id: r.user?.id };
  } catch (e) {
    out.auth = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack?.split("\n").slice(0, 8).join("\n") : undefined,
    };
  }

  return NextResponse.json(out);
}
