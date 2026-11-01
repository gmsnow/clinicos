import { prisma } from "@/lib/db";
import type {
  NotificationCategory,
  NotificationPriority,
} from "@/lib/generated/prisma/client";

export type AppointmentNotificationKind = "created" | "updated" | "cancelled";

function nameOf(
  patient: {
    firstNameAr: string;
    secondNameAr: string | null;
    lastNameAr: string;
    firstNameEn: string | null;
    lastNameEn: string | null;
  },
  locale: "ar" | "en",
) {
  return locale === "en"
    ? [patient.firstNameEn || patient.firstNameAr, patient.lastNameEn || patient.lastNameAr]
        .filter(Boolean)
        .join(" ")
    : [patient.firstNameAr, patient.secondNameAr, patient.lastNameAr]
        .filter(Boolean)
        .join(" ");
}

function copyFor(
  kind: AppointmentNotificationKind,
  locale: "ar" | "en",
  patientName: string,
  date: string,
  time: string,
): { category: NotificationCategory; priority: NotificationPriority; subject: string; body: string } {
  if (locale === "ar") {
    if (kind === "created") {
      return {
        category: "APPOINTMENT_CONFIRMATION",
        priority: "NORMAL",
        subject: `موعد جديد للمريض ${patientName}`,
        body: `تم إضافة موعد للمريض ${patientName} بتاريخ ${date} الساعة ${time}.`,
      };
    }
    if (kind === "cancelled") {
      return {
        category: "APPOINTMENT_CHANGE",
        priority: "HIGH",
        subject: `إلغاء موعد المريض ${patientName}`,
        body: `تم إلغاء موعد المريض ${patientName} بتاريخ ${date} الساعة ${time}.`,
      };
    }
    return {
      category: "APPOINTMENT_CHANGE",
      priority: "NORMAL",
      subject: `تعديل موعد المريض ${patientName}`,
      body: `تم تعديل موعد المريض ${patientName} إلى ${date} الساعة ${time}.`,
    };
  }

  if (kind === "created") {
    return {
      category: "APPOINTMENT_CONFIRMATION",
      priority: "NORMAL",
      subject: `New appointment for ${patientName}`,
      body: `${patientName} has an appointment on ${date} at ${time}.`,
    };
  }
  if (kind === "cancelled") {
    return {
      category: "APPOINTMENT_CHANGE",
      priority: "HIGH",
      subject: `Appointment cancelled for ${patientName}`,
      body: `The appointment for ${patientName} on ${date} at ${time} was cancelled.`,
    };
  }
  return {
    category: "APPOINTMENT_CHANGE",
    priority: "NORMAL",
    subject: `Appointment changed for ${patientName}`,
    body: `The appointment for ${patientName} moved to ${date} at ${time}.`,
  };
}

/** Creates an in-app notification for the doctor assigned to an appointment. */
export async function notifyAppointmentEvent(params: {
  clinicId: string;
  appointmentId: string;
  kind: AppointmentNotificationKind;
}): Promise<void> {
  try {
    const appointment = await prisma.appointment.findFirst({
      where: { id: params.appointmentId, clinicId: params.clinicId },
      select: {
        doctorId: true,
        startTime: true,
        clinic: { select: { timezone: true, locale: true } },
        patient: {
          select: {
            firstNameAr: true,
            secondNameAr: true,
            lastNameAr: true,
            firstNameEn: true,
            lastNameEn: true,
          },
        },
      },
    });

    const doctorId = appointment?.doctorId;
    if (!appointment || !doctorId) return;

    const locale = appointment.clinic?.locale === "en" ? "en" : "ar";
    const timeZone = appointment.clinic?.timezone || "Asia/Aden";

    const date = new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone,
    }).format(appointment.startTime);
    const time = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
    }).format(appointment.startTime);

    const patientName = nameOf(appointment.patient, locale);
    const copy = copyFor(params.kind, locale, patientName, date, time);
    const now = new Date();

    await prisma.notification.create({
      data: {
        clinicId: params.clinicId,
        category: copy.category,
        channel: "IN_APP",
        priority: copy.priority,
        status: "SENT",
        recipientId: doctorId,
        recipientType: "USER",
        subject: copy.subject,
        body: copy.body,
        sentAt: now,
        deliveredAt: now,
        data: { appointmentId: params.appointmentId, event: params.kind },
      },
    });
  } catch (error) {
    console.error("[notifications] appointment event failed", error);
  }
}
