import { UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CreateUserForm } from "@/components/users/create-user-form";
import { ToggleUserButton } from "@/components/users/toggle-user-button";
import { UserRoleSelect } from "@/components/users/user-role-select";
import { UserPagesDialog } from "@/components/users/user-pages-dialog";

export default async function UsersPage() {
  const user = await requirePermission("users:manage");
  const t = await getTranslations("users");
  const tc = await getTranslations("common");
  let clinicId = user.currentClinicId ?? null;
  if (!clinicId) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { clinicId: true, currentClinicId: true } });
      clinicId = dbUser?.currentClinicId ?? dbUser?.clinicId ?? null;
    } catch {}
  }

  const [users, roles, clinics] = await Promise.all([
    prisma.user.findMany({
      where: clinicId ? { clinicId } : {},
      include: {
        role: {
          select: {
            code: true,
            nameEn: true,
            nameAr: true,
            permissions: { select: { permission: { select: { code: true } } } },
          },
        },
        permissionGrants: { select: { permission: { select: { code: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({ orderBy: { code: "asc" } }),
    prisma.clinic.findMany({
      where: clinicId ? { id: clinicId } : {},
      select: { id: true, nameEn: true, nameAr: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} icon={UsersRound} />

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          {users.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
          {users.map((u) => {
            return (
              <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {u.nameAr ?? u.name}
                    {!u.isActive && (
                      <Badge variant="outline" className="ms-2">{t("inactive")}</Badge>
                    )}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{u.username ?? u.email}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <UserPagesDialog
                    userId={u.id}
                    userName={u.nameAr ?? u.name}
                    roleCodes={u.role.permissions.map((p) => p.permission.code)}
                    grantedCodes={u.permissionGrants.map((p) => p.permission.code)}
                  />
                  <UserRoleSelect
                    id={u.id}
                    currentRoleId={u.roleId}
                    roles={roles.map((r) => ({ id: r.id, label: r.nameEn || r.nameAr }))}
                    labels={{ role: t("role"), roleChanged: t("roleChanged"), failed: t("userUpsertFailed") }}
                  />
                  <span className="text-xs text-muted-foreground">{fmtDate(u.createdAt)}</span>
                  <ToggleUserButton
                    id={u.id}
                    active={u.isActive}
                    labels={{
                      active: t("active"),
                      inactive: t("inactive"),
                      failed: t("userUpsertFailed"),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <CreateUserForm
        roles={roles.map((r) => ({ id: r.id, label: r.nameEn || r.nameAr }))}
        clinics={clinics.map((c) => ({ id: c.id, label: c.nameAr || c.nameEn }))}
        labels={{ name: t("name"), nameAr: t("nameAr"), username: t("username"), email: t("email"), password: t("password"), role: t("role"), clinic: t("clinic"), create: t("newUser"), success: t("userCreated"), failed: t("userUpsertFailed") }}
      />
    </div>
  );
}