"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/core/auth/session";
import { recordAudit } from "@/core/audit";
import { prisma } from "@/lib/db";
import { auth } from "@/core/auth/server";
import { z } from "zod";

type Result = { ok: true; id: string } | { ok: false; error: "no-clinic" | "invalid" | "exists" | "failed" };

const schema = z.object({
  name: z.string().trim().min(1),
  nameAr: z.string().trim().optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().trim().email(),
  password: z.string().min(5),
  roleId: z.string().min(1),
  clinicId: z.string().optional(),
  departmentId: z.string().optional(),
  phone: z.string().trim().optional(),
  nationalId: z.string().trim().optional(),
  address: z.string().trim().optional(),
  salary: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().nonnegative().optional(),
  ),
  hireDate: z.string().optional(),
});

export async function createUser(values: unknown): Promise<Result> {
  try {
    const user = await requirePermission("users:manage");
    const parsed = schema.safeParse(values);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    if (!user.roleId) return { ok: false, error: "failed" };

    const [byUsername, byEmail] = await Promise.all([
      prisma.user.findUnique({ where: { username: v.username }, select: { id: true } }),
      prisma.user.findUnique({ where: { email: v.email }, select: { id: true } }),
    ]);
    if (byUsername || byEmail) return { ok: false, error: "exists" };

    const clinicId = user.currentClinicId ?? v.clinicId ?? null;
    const created = await auth.api.signUpEmail({
      body: {
        email: v.email,
        password: v.password,
        name: v.name,
        username: v.username,
        nameAr: v.nameAr || null,
        roleId: v.roleId,
        clinicId,
        currentClinicId: clinicId,
      },
    });
    const id = typeof created.user?.id === "string" ? created.user.id : "";
    if (id) {
      const profile: Record<string, unknown> = {};
      if (v.departmentId) profile.departmentId = v.departmentId;
      if (v.phone) profile.phone = v.phone;
      if (v.nationalId) profile.nationalId = v.nationalId;
      if (v.address) profile.address = v.address;
      if (v.salary != null) profile.salary = v.salary;
      if (v.hireDate) profile.hireDate = new Date(v.hireDate);
      if (Object.keys(profile).length > 0) {
        await prisma.user.update({ where: { id }, data: profile });
      }
    }
    recordAudit({
      actorId: user.id,
      action: "create",
      entity: "User",
      entityId: id,
      clinicId: user.currentClinicId ?? "",
      metadata: { username: v.username, email: v.email, roleId: v.roleId },
    });
    revalidatePath("/users");
    revalidatePath("/employees");
    return { ok: true, id };
  } catch (err: any) {
    console.error("[createUser] error:", err?.message || err);
    return { ok: false, error: "failed" };
  }
}

export async function saveUserPagePermissions(
  userId: string,
  codes: string[],
): Promise<Result> {
  const actor = await requirePermission("users:manage");
  const where = actor.currentClinicId
    ? { id: userId, clinicId: actor.currentClinicId }
    : { id: userId };
  const target = await prisma.user.findFirst({ where, select: { id: true } });
  if (!target) return { ok: false, error: "failed" };

  const unique = [...new Set(codes.filter((c) => typeof c === "string" && c.includes(":")))];
  const permissions = unique.length
    ? await prisma.permission.findMany({
        where: { code: { in: unique } },
        select: { id: true },
      })
    : [];

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    ...(permissions.length
      ? [
          prisma.userPermission.createMany({
            data: permissions.map((p) => ({ userId, permissionId: p.id })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  recordAudit({
    actorId: actor.id,
    action: "update",
    entity: "UserPermission",
    entityId: userId,
    clinicId: actor.currentClinicId ?? "",
    metadata: { codes: unique },
  });
  revalidatePath("/users");
  revalidatePath("/");
  return { ok: true, id: userId };
}

export async function toggleActive(id: string, active: boolean): Promise<Result> {
  const user = await requirePermission("users:manage");
  const where = user.currentClinicId ? { id, clinicId: user.currentClinicId } : { id };
  const target = await prisma.user.findFirst({ where, select: { id: true } });
  if (!target) return { ok: false, error: "failed" };

  await prisma.user.update({ where: { id }, data: { isActive: active } });
  recordAudit({
    actorId: user.id,
    action: "update",
    entity: "User",
    entityId: id,
    clinicId: user.currentClinicId ?? "",
    metadata: { isActive: active },
  });
  revalidatePath("/users");
  return { ok: true, id };
}

export async function assignRole(id: string, roleId: string): Promise<Result> {
  const user = await requirePermission("users:manage");
  const where = user.currentClinicId ? { id, clinicId: user.currentClinicId } : { id };
  const [role, target] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId }, select: { id: true, code: true } }),
    prisma.user.findFirst({ where, select: { id: true } }),
  ]);
  if (!role || !target) return { ok: false, error: "failed" };

  await prisma.user.update({ where: { id }, data: { roleId } });
  recordAudit({
    actorId: user.id,
    action: "update",
    entity: "User",
    entityId: id,
    clinicId: user.currentClinicId ?? "",
    metadata: { roleId, roleCode: role.code },
  });
  revalidatePath("/users");
  return { ok: true, id };
}