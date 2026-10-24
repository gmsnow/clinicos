import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/core/auth/server";
import { prisma } from "@/lib/db";
import { can, canAny, canAll } from "@/core/rbac";
import type { PermissionCode } from "@/core/rbac/catalog";
import type { ScopeOptions } from "@/core/rbac";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  image?: string | null;
  roleId: string;
  roleCode?: string;
  currentClinicId?: string | null;
  departmentId?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) { console.error("[session] no session"); return null; }
    const u = session.user as unknown as SessionUser;
    let currentClinicId = u.currentClinicId ?? null;
    if (!currentClinicId && u.id) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: u.id },
          select: { clinicId: true, currentClinicId: true },
        });
        currentClinicId = dbUser?.currentClinicId ?? dbUser?.clinicId ?? null;
      } catch (err: any) {
        console.error("[session] clinic fallback failed:", err?.message);
      }
    }
    console.error("[session] got user:", u.id, currentClinicId);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      username: u.username ?? "",
      image: u.image,
      roleId: u.roleId ?? "",
      currentClinicId,
      departmentId: u.departmentId ?? null,
    };
  } catch (err: any) {
    console.error("[session] getSessionUser error:", err?.message, err?.stack?.split('\n').slice(0,3).join(' | '));
    return null;
  }
}

const getRoleCode = cache(async (roleId: string) => {
  if (!roleId) return null;
  const role = await prisma.role.findUnique({
    where: { id: roleId },
    select: { code: true },
  });
  return role?.code ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const roleCode = await getRoleCode(user.roleId);
  return { ...user, roleCode: roleCode ?? undefined };
}

export async function requirePermission(
  permission: PermissionCode,
  scope: ScopeOptions = {},
): Promise<SessionUser> {
  const user = await requireUser();
  const allowed = await can(user, permission, scope);
  if (!allowed) redirect("/403");
  return user;
}

export async function requireAnyPermission(
  permissions: PermissionCode[],
  scope: ScopeOptions = {},
): Promise<SessionUser> {
  const user = await requireUser();
  const allowed = await canAny(user, permissions, scope);
  if (!allowed) redirect("/403");
  return user;
}

export async function requireAllPermissions(
  permissions: PermissionCode[],
  scope: ScopeOptions = {},
): Promise<SessionUser> {
  const user = await requireUser();
  const allowed = await canAll(user, permissions, scope);
  if (!allowed) redirect("/403");
  return user;
}