"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  reason: z.string().optional(),
  givenAt: z.string().optional(),
  notes: z.string().optional(),
});

function parseAdvance(formData: FormData) {
  const parsed = schema.safeParse({
    employeeId: formData.get("employeeId") || undefined,
    amount: formData.get("amount") || undefined,
    reason: formData.get("reason") || undefined,
    givenAt: formData.get("givenAt") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new Error("invalid");
  return {
    employeeId: parsed.data.employeeId,
    amount: parsed.data.amount,
    reason: parsed.data.reason || null,
    givenAt: parsed.data.givenAt ? new Date(parsed.data.givenAt) : new Date(),
    notes: parsed.data.notes || null,
  };
}

async function assertEmployee(clinicId: string, employeeId: string) {
  const employee = await prisma.user.findFirst({
    where: { id: employeeId, clinicId },
    select: { id: true },
  });
  if (!employee) throw new Error("invalid employee");
}

export async function createAdvance(formData: FormData) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  const data = parseAdvance(formData);
  await assertEmployee(clinicId, data.employeeId);

  await prisma.advance.create({
    data: {
      ...data,
      clinicId,
    },
  });

  revalidatePath("/advances");
}

export async function updateAdvance(id: string, formData: FormData) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  const data = parseAdvance(formData);
  await assertEmployee(clinicId, data.employeeId);

  const result = await prisma.advance.updateMany({
    where: { id, clinicId },
    data,
  });
  if (result.count === 0) throw new Error("not found");

  revalidatePath("/advances");
}

export async function updateAdvanceStatus(id: string, status: string) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  const data: { status: string; repaidAt?: Date } = { status };
  if (status === "REPAID") data.repaidAt = new Date();
  await prisma.advance.updateMany({ where: { id, clinicId }, data });
  revalidatePath("/advances");
}

export async function deleteAdvance(id: string) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  await prisma.advance.deleteMany({ where: { id, clinicId } });
  revalidatePath("/advances");
}
