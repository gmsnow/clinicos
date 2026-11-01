"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/auth/session";
import { recordAudit } from "@/core/audit";
import { notifyAppointmentEvent } from "@/core/notifications/events";
import { prisma } from "@/lib/db";
import type { AppointmentStatus } from "@/lib/generated/prisma/client";
import {
  appointmentFormSchema,
  STATUS_TRANSITIONS,
  type AppointmentFormValues,
  type AppointmentStatusValue,
} from "./schema";

type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "no-clinic" | "not-found" | "conflict" | "invalid" };

const NON_BLOCKING_STATUSES: AppointmentStatus[] = ["CANCELLED", "NO_SHOW"];

async function findConflict(
  clinicId: string,
  doctorId: string,
  start: Date,
  end: Date,
  excludeId?: string,
) {
  return prisma.appointment.findFirst({
    where: {
      clinicId,
      doctorId,
      id: excludeId ? { not: excludeId } : undefined,
      status: { notIn: NON_BLOCKING_STATUSES },
      startTime: { lt: end },
      endTime: { gt: start },
    },
    select: { id: true },
  });
}

async function applyValues(values: AppointmentFormValues) {
  const parsed = appointmentFormSchema.parse(values);
  const [datePart, timePart] = parsed.date.split("-").map(Number);
  const [hh, mm] = parsed.startTime.split(":").map(Number);
  const h = hh ?? 0;
  const m = mm ?? 0;
  const start = new Date(Date.UTC(datePart ?? 0, (timePart ?? 1) - 1, h, h, m));
  const duration = parsed.durationMinutes;
  return {
    parsed,
    start,
    end: new Date(start.getTime() + duration * 60_000),
    duration,
  };
}

export async function createAppointment(
  values: AppointmentFormValues,
): Promise<ActionResult> {
  const user = await requirePermission("appointments:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) return { ok: false, error: "no-clinic" };

  try {
    const { parsed, start, end, duration } = await applyValues(values);
    const conflict = await findConflict(clinicId, parsed.doctorId, start, end);
    if (conflict) return { ok: false, error: "conflict" };

    const appointment = await prisma.appointment.create({
      data: {
        clinicId,
        patientId: parsed.patientId,
        doctorId: parsed.doctorId,
        departmentId: parsed.departmentId || null,
        roomId: parsed.roomId || null,
        startTime: start,
        endTime: end,
        durationMinutes: duration,
        type: parsed.type,
        reason: parsed.reason || null,
        notes: parsed.notes || null,
        createdBy: user.id,
        updatedBy: user.id,
      },
      select: { id: true },
    });

    recordAudit({
      actorId: user.id,
      action: "create",
      entity: "Appointment",
      entityId: appointment.id,
      clinicId,
      metadata: { patientId: parsed.patientId, startTime: start.toISOString() },
    });
    await notifyAppointmentEvent({
      clinicId,
      appointmentId: appointment.id,
      kind: "created",
    });
    revalidatePath("/appointments");
    revalidatePath("/");
    return { ok: true, id: appointment.id };
  } catch (err) {
    const e = err as Error & { name?: string };
    if (e.name === "ZodError") return { ok: false, error: "invalid" };
    throw err;
  }
}

export async function updateAppointment(
  id: string,
  values: AppointmentFormValues,
): Promise<ActionResult> {
  const user = await requirePermission("appointments:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) return { ok: false, error: "no-clinic" };

  const existing = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { id: true },
  });
  if (!existing) return { ok: false, error: "not-found" };

  const { parsed, start, end, duration } = await applyValues(values);
  const conflict = await findConflict(clinicId, parsed.doctorId, start, end, id);
  if (conflict) return { ok: false, error: "conflict" };

  await prisma.appointment.update({
    where: { id },
    data: {
      patientId: parsed.patientId,
      doctorId: parsed.doctorId,
      departmentId: parsed.departmentId || null,
      roomId: parsed.roomId || null,
      startTime: start,
      endTime: end,
      durationMinutes: duration,
      type: parsed.type,
      reason: parsed.reason || null,
      notes: parsed.notes || null,
      updatedBy: user.id,
    },
  });

  recordAudit({
    actorId: user.id,
    action: "update",
    entity: "Appointment",
    entityId: id,
    clinicId,
    metadata: { startTime: start.toISOString() },
  });
  await notifyAppointmentEvent({ clinicId, appointmentId: id, kind: "updated" });
  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  return { ok: true, id };
}

export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatusValue,
): Promise<ActionResult> {
  const user = await requirePermission("appointments:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) return { ok: false, error: "no-clinic" };

  const existing = await prisma.appointment.findFirst({
    where: { id, clinicId },
    select: { status: true },
  });
  if (!existing) return { ok: false, error: "not-found" };

  const allowed = STATUS_TRANSITIONS[existing.status];
  if (!allowed.includes(status)) return { ok: false, error: "invalid" };

  await prisma.appointment.update({
    where: { id },
    data: { status, updatedBy: user.id },
  });

  recordAudit({
    actorId: user.id,
    action: "update",
    entity: "Appointment",
    entityId: id,
    clinicId,
    metadata: { status, from: existing.status },
  });
  if (status === "CANCELLED" || status === "NO_SHOW") {
    await notifyAppointmentEvent({ clinicId, appointmentId: id, kind: "cancelled" });
  }
  revalidatePath("/appointments");
  revalidatePath(`/appointments/${id}`);
  return { ok: true, id };
}