import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import type { NotificationChannel, NotificationCategory, NotificationPriority } from "@/lib/generated/prisma/client";

/** POST /api/notifications - Send a notification */
export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission("notifications:send");
    const body = await request.json();
    
    const {
      category,
      channel,
      recipientId,
      recipientType = "USER",
      priority = "NORMAL",
      subject,
      body: messageBody,
      data,
      templateId,
      scheduledAt,
      maxRetries = 3,
    } = body;

    if (!category || !channel || !recipientId || !messageBody) {
      return NextResponse.json(
        { error: "Missing required fields: category, channel, recipientId, body" },
        { status: 400 }
      );
    }

    const clinicId = user.currentClinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic context" }, { status: 400 });
    }

    // Verify template exists if provided
    let template = null;
    if (templateId) {
      template = await prisma.notificationTemplate.findFirst({
        where: { id: templateId, clinicId },
      });
      if (!template) {
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
      }
    }

    // Validate the recipient belongs to this clinic
    if (recipientType === "USER" || recipientType === "STAFF") {
      const recipient = await prisma.user.findFirst({
        where: { id: recipientId, clinicId },
        select: { id: true },
      });
      if (!recipient) {
        return NextResponse.json({ error: "Recipient not found in clinic" }, { status: 404 });
      }
    } else if (recipientType === "PATIENT") {
      const recipient = await prisma.patient.findFirst({
        where: { id: recipientId, clinicId },
        select: { id: true },
      });
      if (!recipient) {
        return NextResponse.json({ error: "Recipient not found in clinic" }, { status: 404 });
      }
    }

    const isInApp = channel === "IN_APP";
    const now = new Date();

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        clinicId,
        templateId,
        category,
        channel,
        priority,
        status: isInApp ? "SENT" : "PENDING",
        recipientId,
        recipientType,
        subject,
        body: messageBody,
        data,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        sentAt: isInApp ? now : null,
        deliveredAt: isInApp ? now : null,
        maxRetries,
      },
    });

    // If scheduled for now or past, queue for immediate processing
    if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
      // In production, this would be queued to a worker
      // For now, we'll just return the notification
    }

    return NextResponse.json({ ok: true, id: notification.id });
  } catch (error) {
    if (error instanceof Error && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("Error sending notification:", error);
    return NextResponse.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}

/** GET /api/notifications - List notifications */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("notifications:read");
    const { searchParams } = new URL(request.url);
    
    const page = parseInt(searchParams.get("page") ?? "1");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const channel = searchParams.get("channel");
    const recipientId = searchParams.get("recipientId");
    const scope = searchParams.get("scope");
    const fromDate = searchParams.get("fromDate");
    const toDate = searchParams.get("toDate");

    const clinicId = user.currentClinicId;
    if (!clinicId) {
      return NextResponse.json({ error: "No clinic context" }, { status: 400 });
    }

    const where: Record<string, unknown> = { clinicId };

    if (status) where.status = status;
    if (category) where.category = category;
    if (channel) where.channel = channel;
    if (recipientId) {
      where.recipientId = recipientId;
    } else if (!(scope === "clinic" && (await can(user, "notifications:manage")))) {
      where.recipientId = user.id;
    }
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) (where.createdAt as Record<string, Date>).gte = new Date(fromDate);
      if (toDate) (where.createdAt as Record<string, Date>).lte = new Date(toDate);
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          template: { select: { id: true, name: true, category: true } },
          deliveryLogs: { take: 5, orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof Error && "digest" in error && String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw error;
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}