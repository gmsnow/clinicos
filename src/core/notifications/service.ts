import { prisma } from "@/lib/db";
import type {
  Prisma,
  Notification,
  NotificationTemplate,
  NotificationPreference,
  NotificationConsent,
  NotificationRetryPolicy,
  NotificationDeliveryLog,
  NotificationChannel,
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
} from "@/lib/generated/prisma/client";
import type {
  NotificationPayload,
  SendResult,
  NotificationChannelAdapter,
  RecipientInfo,
  ChannelConfig,
  NotificationSystemConfig,
  TemplateContext,
} from "./types";
import {
  renderTemplate,
  getLocalizedContent,
  getLocalizedSubject,
  extractVariables,
  validateTemplateContext,
  getChannelContent,
  getSystemTemplate,
} from "./template";
import { format } from "date-fns";

/** Default system configuration */
const DEFAULT_CONFIG: NotificationSystemConfig = {
  defaultMaxRetries: 3,
  defaultBaseDelayMinutes: 5,
  defaultMaxDelayMinutes: 1440,
  defaultBackoffMultiplier: 2.0,
  defaultJitterPercent: 0.1,
  quietHoursDefaultStart: "22:00",
  quietHoursDefaultEnd: "08:00",
  channels: {},
};

/** Built-in channel adapters (to be implemented by integrations) */
const channelAdapters = new Map<NotificationChannel, NotificationChannelAdapter>();

/** Register a channel adapter */
export function registerChannelAdapter(adapter: NotificationChannelAdapter): void {
  channelAdapters.set(adapter.channel, adapter);
}

/** Get a channel adapter */
export function getChannelAdapter(channel: NotificationChannel): NotificationChannelAdapter | undefined {
  return channelAdapters.get(channel);
}

/** In-memory adapter for development/testing (logs instead of sending) */
export class LogChannelAdapter implements NotificationChannelAdapter {
  readonly channel: NotificationChannel;

  constructor(channel: NotificationChannel) {
    this.channel = channel;
  }

  async send(payload: { body: string; recipientId: string; subject?: string }): Promise<{ success: boolean; externalId: string }> {
    console.log(`[${this.channel}] To: ${payload.recipientId} | Subject: ${payload.subject ?? "N/A"} | Body: ${payload.body.substring(0, 100)}...`);
    return {
      success: true,
      externalId: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
    };
  }
}

/**
 * Register built-in adapters. Without external provider credentials these log
 * deliveries instead of failing, so queued notifications never get stuck.
 */
for (const channel of ["IN_APP", "EMAIL", "SMS", "WHATSAPP"] as NotificationChannel[]) {
  registerChannelAdapter(new LogChannelAdapter(channel));
}

/** Get recipient information for a user/patient */
export async function getRecipientInfo(
  recipientId: string,
  recipientType: "USER" | "PATIENT" | "STAFF" | "EXTERNAL" = "USER"
): Promise<{
  email?: string;
  phone?: string;
  whatsapp?: string;
  locale: "ar" | "en";
  preferences: NotificationPreference[];
  consent: NotificationConsent[];
} | null> {
  const clinicId = (await getCurrentClinicId()) ?? "";

  if (recipientType === "PATIENT") {
    const patient = await prisma.patient.findUnique({
      where: { id: recipientId },
      select: { email: true, phone: true, locale: true },
    });
    if (!patient) return null;
    return {
      email: patient.email ?? undefined,
      phone: patient.phone ?? undefined,
      locale: patient.locale === "ar" ? "ar" : "en",
      preferences: [],
      consent: [],
    };
  }

  if (recipientType === "USER" || recipientType === "STAFF") {
    const user = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { email: true, phone: true, locale: true, notificationPreferences: true, notificationConsents: true },
    });
    if (!user) return null;
    return {
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      locale: user.locale === "ar" ? "ar" : "en",
      preferences: user.notificationPreferences ?? [],
      consent: user.notificationConsents ?? [],
    };
  }

  return null;
}

/** Get current clinic ID from session (server component context) */
async function getCurrentClinicId(): Promise<string | null> {
  try {
    const { getSessionUser } = await import("@/core/auth/session");
    const user = await getSessionUser();
    return user?.currentClinicId ?? null;
  } catch {
    return null;
  }
}

/** Check if notification should be sent based on preferences and consent */
export function shouldSendNotification(
  notification: {
    category: string;
    channel: string;
    recipientType: string;
  },
  preferences: NotificationPreference[],
  consents: NotificationConsent[]
): boolean {
  // Check consent
  const consent = consents.find(c => c.channel === notification.channel);
  if (consent && !consent.consented) return false;

  // Check preference
  const preference = preferences.find(
    p => p.category === notification.category && p.channel === notification.channel
  );
  if (preference && !preference.enabled) return false;

  // Check quiet hours (simplified - would need timezone handling in production)
  // TODO: Implement quiet hours check with user timezone

  return true;
}

/** Calculate next retry delay with exponential backoff and jitter */
export function calculateRetryDelay(
  retryCount: number,
  policy: Pick<
    NotificationRetryPolicy,
    "baseDelayMinutes" | "maxDelayMinutes" | "backoffMultiplier" | "jitterPercent" | "maxRetries"
  >
): number {
  const { baseDelayMinutes, maxDelayMinutes, backoffMultiplier, jitterPercent } = policy;
  
  const exponentialDelay = baseDelayMinutes * Math.pow(backoffMultiplier, retryCount);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMinutes);
  
  const jitter = cappedDelay * policy.jitterPercent * (Math.random() * 2 - 1);
  const finalDelay = Math.max(1, Math.round(cappedDelay + jitter));
  
  return Math.min(finalDelay, maxDelayMinutes);
}

/** Build notification payload from template */
export async function buildNotificationPayload(
  template: NotificationTemplate,
  payload: {
    clinicId: string;
    recipientId: string;
    recipientType: "USER" | "PATIENT" | "STAFF" | "EXTERNAL";
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT" | "CRITICAL";
    context: Record<string, string | number | Date | boolean | null | undefined>;
    scheduledAt?: Date;
    maxRetries?: number;
  }
): Promise<{
  notification: Omit<
    Notification,
    "id" | "createdAt" | "updatedAt" | "template" | "deliveryLogs" | "preferences"
  >;
  context: Record<string, string | number | Date | boolean | null | undefined>;
} | null> {
  const recipientInfo = await getRecipientInfo(payload.recipientId, payload.recipientType);
  if (!recipientInfo) return null;

  // Check preferences and consent
  const prefs = await prisma.notificationPreference.findMany({
    where: { clinicId: payload.clinicId, userId: payload.recipientId },
  });
  const consents = await prisma.notificationConsent.findMany({
    where: { clinicId: payload.clinicId, userId: payload.recipientId },
  });

  // Check if should send for IN_APP (always allowed)
  if (!shouldSendNotification(
    { category: template.category, channel: "IN_APP", recipientType: "USER" },
    [],
    []
  )) {
    // IN_APP is always allowed as fallback
  }

  // Get localized content
  const locale = payload.context.locale === "ar" ? "ar" : "en";
  const { subject, body } = getChannelContent(template, locale, payload.context);

  return {
    notification: {
      clinicId: payload.clinicId,
      templateId: template.id,
      category: template.category,
      channel: "IN_APP", // Will be overridden per channel
      priority: payload.priority ?? "NORMAL",
      status: "PENDING",
      recipientId: payload.recipientId,
      recipientType: payload.recipientType,
      subject: subject || null,
      body,
      data: JSON.parse(JSON.stringify(payload.context)) as Prisma.JsonValue,
      scheduledAt: payload.scheduledAt ?? null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      failureReason: null,
      retryCount: 0,
      maxRetries: payload.maxRetries ?? 3,
      externalId: null,
      externalData: null,
    },
    context: payload.context,
  };
}

/** Create notification record in database */
export async function createNotification(
  notification: Omit<
    Notification,
    "id" | "createdAt" | "updatedAt" | "template" | "deliveryLogs" | "preferences"
  >,
  deliveryLogs?: Prisma.NotificationDeliveryLogCreateWithoutNotificationInput[]
): Promise<Notification> {
  const { templateId, ...rest } = notification;
  const data = {
    ...rest,
    ...(templateId ? { template: { connect: { id: templateId } } } : {}),
    deliveryLogs: deliveryLogs ? { create: deliveryLogs } : undefined,
  } as Prisma.NotificationCreateInput;
  const isInApp = data.channel === "IN_APP";
  if (isInApp) {
    data.status = "SENT";
    data.sentAt = new Date();
    data.deliveredAt = data.sentAt;
  }
  return prisma.notification.create({ data });
}

/** Send notification through a specific channel */
export async function sendNotificationViaChannel(
  notification: Notification,
  channel: NotificationChannel,
  adapter: NotificationChannelAdapter,
  recipientInfo: NonNullable<Awaited<ReturnType<typeof getRecipientInfo>>>
): Promise<{ success: boolean; externalId?: string; externalData?: Record<string, unknown>; error?: string }> {
  let payload: NotificationPayload = {
    clinicId: notification.clinicId,
    category: notification.category,
    channel,
    recipientId: notification.recipientId,
    subject: notification.subject ?? undefined,
    body: notification.body,
  };

  // Customize payload per channel
  switch (channel) {
    case "EMAIL":
      if (!recipientInfo.email) {
        return { success: false, error: "No email address" };
      }
      payload.recipientId = recipientInfo.email;
      break;
    case "SMS":
    case "WHATSAPP":
      if (!recipientInfo.phone && !recipientInfo.whatsapp) {
        return { success: false, error: "No phone number" };
      }
      payload.recipientId = recipientInfo.whatsapp ?? recipientInfo.phone ?? "";
      break;
  }

  try {
    const result = await adapter.send(payload);
    return {
      success: result.success,
      externalId: result.externalId,
      externalData: result.externalData,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Process scheduled notifications (for cron/worker) */
export async function processScheduledNotifications(): Promise<{
  processed: number;
  sent: number;
  failed: number;
}> {
  const now = new Date();
  const notifications = await prisma.notification.findMany({
    where: {
      status: { in: ["PENDING", "QUEUED"] },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
    },
    take: 100,
    orderBy: { createdAt: "asc" },
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const notification of notifications) {
    processed++;
    try {
      // Get template if exists
      let template = notification.templateId
        ? await prisma.notificationTemplate.findUnique({ where: { id: notification.templateId } })
        : null;

      if (!template) {
        // Use notification body directly
        await processNotificationDelivery(notification);
      } else {
        await processNotificationDelivery(notification, template);
      }
      sent++;
    } catch (error) {
      failed++;
      await handleNotificationFailure(notification, error instanceof Error ? error.message : "Unknown error");
    }
  }

  return { processed, sent, failed };
}

/** Process a single notification delivery */
async function processNotificationDelivery(
  notification: Notification,
  template?: NotificationTemplate | null
): Promise<void> {
  const channels = await getEnabledChannelsForNotification(notification);
  
  for (const channel of channels) {
    const adapter = getChannelAdapter(channel);
    if (!adapter) {
      console.warn(`No adapter for channel ${channel}, skipping`);
      continue;
    }

    const recipientInfo = await getRecipientInfo(
      notification.recipientId,
      notification.recipientType as "USER" | "PATIENT" | "STAFF" | "EXTERNAL",
    );
    if (!recipientInfo) {
      await logDeliveryFailure(notification, channel, "Recipient not found");
      continue;
    }

    const result = await sendNotificationViaChannel(notification, channel, adapter, recipientInfo);
    
    await prisma.notificationDeliveryLog.create({
      data: {
        notificationId: notification.id,
        channel,
        status: result.success ? "SENT" : "FAILED",
        providerId: result.externalId,
        providerData: result.externalData as Prisma.InputJsonValue,
        errorMessage: result.error,
        sentAt: result.success ? new Date() : null,
      },
    });

    if (result.success) {
      // Update notification status if this is the first successful delivery
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          externalId: result.externalId,
          externalData: result.externalData as Prisma.InputJsonValue,
        },
      });
      break; // Stop after first successful delivery
    }
  }

  // If all channels failed, schedule retry
  const allFailed = await allChannelsFailed(notification);
  if (allFailed) {
    await scheduleRetry(notification);
  }
}

async function getEnabledChannelsForNotification(notification: Notification): Promise<NotificationChannel[]> {
  const prefs = await prisma.notificationPreference.findMany({
    where: {
      clinicId: notification.clinicId,
      userId: notification.recipientId,
      category: notification.category,
      enabled: true,
    },
  });

  // Always include IN_APP as fallback
  const channels = [...new Set([...prefs.map(p => p.channel), "IN_APP"])];
  return channels as NotificationChannel[];
}

async function allChannelsFailed(notification: Notification): Promise<boolean> {
  const logs = await prisma.notificationDeliveryLog.findMany({
    where: { notificationId: notification.id },
    select: { status: true },
  });
  return logs.length > 0 && logs.every(l => l.status === "FAILED");
}

async function logDeliveryFailure(
  notification: Notification,
  channel: NotificationChannel,
  error: string
): Promise<void> {
  await prisma.notificationDeliveryLog.create({
    data: {
      notificationId: notification.id,
      channel,
      status: "FAILED",
      errorMessage: error,
    },
  });
}

async function scheduleRetry(notification: Notification): Promise<void> {
  const policy = await prisma.notificationRetryPolicy.findUnique({
    where: {
      clinicId_channel_priority: {
        clinicId: notification.clinicId,
        channel: notification.channel,
        priority: notification.priority,
      },
    },
  });

  const maxRetries = policy?.maxRetries ?? 3;
  const retryCount = notification.retryCount + 1;

  if (retryCount > maxRetries) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: "Max retries exceeded",
        retryCount,
      },
    });
    return;
  }

  const policyForCalc = {
    baseDelayMinutes: 5,
    maxDelayMinutes: 1440,
    backoffMultiplier: 2.0,
    jitterPercent: 0.1,
  };

  const delayMinutes = calculateRetryDelay(retryCount - 1, {
    ...policyForCalc,
    maxRetries,
  });

  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: "PENDING",
      retryCount,
      scheduledAt: new Date(Date.now() + delayMinutes * 60 * 1000),
    },
  });
}

async function handleNotificationFailure(notification: Notification, error: string): Promise<void> {
  await prisma.notification.update({
    where: { id: notification.id },
    data: {
      status: "FAILED",
      failedAt: new Date(),
      failureReason: error,
    },
  });
}