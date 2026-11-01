import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processScheduledNotifications } from "@/core/notifications/service";

/** POST /api/notifications/process - Process scheduled notifications (for cron) */
export async function POST(request: NextRequest) {
  const secret = process.env.NOTIFICATIONS_CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processScheduledNotifications();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Error processing notifications:", error);
    return NextResponse.json(
      { error: "Failed to process notifications" },
      { status: 500 }
    );
  }
}
/** GET /api/notifications/process - Vercel cron compatible entrypoint */
export async function GET(request: NextRequest) {
  return POST(request);
}
