import { Briefcase } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { ListShell, ListRow } from "@/components/data/list-shell";
import { StatusBadge } from "@/components/data/status-badge";
import { EmptyState } from "@/components/empty-state";
import { fmtMoney } from "@/lib/format";
import { EmployeeDialog } from "@/components/employees/employee-dialog";

export default async function EmployeesPage() {
  const user = await requirePermission("staff:read");
  const locale = await getLocale();
  const t = await getTranslations("employees");
  const tu = await getTranslations("users");
  const tc = await getTranslations("common");
  let clinicId = user.currentClinicId ?? null;
  if (!clinicId) {
    try {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { clinicId: true, currentClinicId: true } });
      clinicId = dbUser?.currentClinicId ?? dbUser?.clinicId ?? null;
    } catch {}
  }
  const canManage = await can(user, "users:manage");

  const [employees, roles, departments] = await Promise.all([
    prisma.user.findMany({
      where: clinicId ? { clinicId } : {},
      include: {
        role: { select: { code: true, nameAr: true, nameEn: true } },
        department: { select: { nameAr: true, nameEn: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    canManage ? prisma.role.findMany({ orderBy: { code: "asc" } }) : [],
    canManage
      ? prisma.department.findMany({
          where: clinicId ? { clinicId } : {},
          orderBy: { nameAr: "asc" },
        })
      : [],
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={Briefcase}
        actions={
          canManage ? (
            <EmployeeDialog
              roles={roles.map((r) => ({
                id: r.id,
                label: locale === "ar" ? r.nameAr : r.nameEn,
              }))}
              departments={departments.map((d) => ({
                id: d.id,
                label: locale === "ar" ? d.nameAr : d.nameEn,
              }))}
              labels={{
                add: t("add"),
                name: tu("name"),
                nameAr: tu("nameAr"),
                username: tu("username"),
                email: tu("email"),
                password: tu("password"),
                role: tu("role"),
                department: t("department"),
                phone: t("phone"),
                nationalId: t("nationalId"),
                address: t("address"),
                salary: t("salary"),
                hireDate: t("hireDate"),
                personalInfo: t("personalInfo"),
                accountInfo: t("accountInfo"),
                creating: t("creating"),
                success: tu("userCreated"),
                failed: tu("userUpsertFailed"),
              }}
            />
          ) : null
        }
      />

      <ListShell>
        {employees.length === 0 ? (
          <EmptyState icon={Briefcase} title={t("empty")} description={t("emptyDesc")} />
        ) : (
          employees.map((e, i) => (
            <ListRow key={e.id} index={i}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">{e.nameAr ?? e.name}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {e.username ?? e.email}
                </span>
                {((e as any).phone || (e as any).nationalId) && (
                  <span className="text-xs text-muted-foreground">
                    {[(e as any).phone && `📞 ${(e as any).phone}`, (e as any).nationalId && `🆔 ${(e as any).nationalId}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                {(e as any).address && (
                  <span className="truncate text-xs text-muted-foreground">{(e as any).address}</span>
                )}
              </div>
              <span className="hidden shrink-0 text-muted-foreground sm:inline">
                {e.department
                  ? locale === "ar"
                    ? e.department.nameAr
                    : e.department.nameEn
                  : "—"}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {locale === "ar" ? e.role.nameAr : e.role.nameEn}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t("salary")}: {(e as any).salary ? fmtMoney(Number((e as any).salary)) : "—"}
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground lg:inline">
                {(e as any).hireDate ? fmtDate((e as any).hireDate, locale) : "—"}
              </span>
              <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
                {fmtDate(e.createdAt, locale)}
              </span>
              <StatusBadge status={e.isActive ? "ACTIVE_USER" : "INACTIVE"}>
                {e.isActive ? tu("active") : tu("inactive")}
              </StatusBadge>
            </ListRow>
          ))
        )}
      </ListShell>
    </div>
  );
}
