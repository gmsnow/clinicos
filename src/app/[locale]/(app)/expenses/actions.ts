"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/lib/db";

const schema = z.object({
  category: z.string().optional(),
  description: z.string().min(1),
  amount: z.coerce.number().positive(),
  paidAt: z.string().optional(),
  notes: z.string().optional(),
});

function parseExpense(formData: FormData) {
  const parsed = schema.safeParse({
    category: formData.get("category") || undefined,
    description: formData.get("description") || undefined,
    amount: formData.get("amount") || undefined,
    paidAt: formData.get("paidAt") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) throw new Error("invalid");
  return {
    category: parsed.data.category || null,
    description: parsed.data.description,
    amount: parsed.data.amount,
    paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
    notes: parsed.data.notes || null,
  };
}

export async function createExpense(formData: FormData) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  const data = parseExpense(formData);

  await prisma.expense.create({
    data: {
      ...data,
      clinicId,
      paidById: user.id,
    },
  });

  revalidatePath("/expenses");
}

export async function updateExpense(id: string, formData: FormData) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  const data = parseExpense(formData);

  const result = await prisma.expense.updateMany({
    where: { id, clinicId },
    data,
  });
  if (result.count === 0) throw new Error("not found");

  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  const user = await requirePermission("accounting:write");
  const clinicId = user.currentClinicId;
  if (!clinicId) throw new Error("no clinic");

  await prisma.expense.deleteMany({ where: { id, clinicId } });
  revalidatePath("/expenses");
}
