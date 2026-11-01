import { HandCoins } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { ListShell, ListRow } from "@/components/data/list-shell";
import { StatusBadge } from "@/components/data/status-badge";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  AdvanceDialog,
  type AdvanceLabels,
} from "@/components/advances/advance-dialog";
import { AdvanceRowActions } from "@/components/advances/advance-row-actions";
import { createAdvance } from "./actions";

export default async function AdvancesPage() {
  const user = await requirePermission("accounting:read");
  const locale = await getLocale();
  const t = await getTranslations("advances");
  const tc = await getTranslations("common");
  const canWrite = await can(user, "accounting:write");
  const clinicId = user.currentClinicId;

  const [advances, employees] = await Promise.all([
    clinicId
      ? prisma.advance.findMany({
          where: { clinicId },
          include: { employee: { select: { name: true, nameAr: true } } },
          orderBy: { givenAt: "desc" },
          take: 200,
        })
      : [],
    clinicId
      ? prisma.user.findMany({
          where: { clinicId, isActive: true },
          select: { id: true, name: true, nameAr: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);

  const labels: AdvanceLabels = {
    add: t("add"),
    edit: t("edit"),
    employee: t("employee"),
    amount: t("amount"),
    reason: t("reason"),
    givenAt: t("givenAt"),
    notes: t("notes"),
    save: t("save"),
    saving: t("saving"),
    cancel: tc("cancel"),
    deleting: tc("deleting"),
    created: t("created"),
    updated: t("updated"),
    failed: t("actionFailed"),
    delete: tc("delete"),
    deleteTitle: t("deleteTitle"),
    deleteDescription: t("deleteDescription"),
    deleted: t("deleted"),
    deleteFailed: t("deleteFailed"),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={HandCoins}
        actions={
          canWrite ? (
            <AdvanceDialog
              employees={employees}
              action={createAdvance}
              labels={labels}
            />
          ) : undefined
        }
      />
      {advances.length === 0 ? (
        <EmptyState icon={HandCoins} title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <ListShell>
          {advances.map((a, i) => (
            <ListRow key={a.id} index={i}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">
                  {a.employee?.nameAr || a.employee?.name || "—"}
                </span>
                <span className="text-xs text-muted-foreground">{a.reason || "—"}</span>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {fmtMoney(Number(a.amount))}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {fmtDate(a.givenAt, locale)}
              </span>
              <StatusBadge
                status={
                  a.status === "REPAID"
                    ? "COMPLETED"
                    : a.status === "CANCELLED"
                      ? "CANCELLED"
                      : "PENDING"
                }
              >
                {a.status === "REPAID"
                  ? t("repaid")
                  : a.status === "CANCELLED"
                    ? t("cancelled")
                    : t("pending")}
              </StatusBadge>
              {canWrite && (
                <AdvanceRowActions
                  labels={labels}
                  employees={employees}
                  advance={{
                    id: a.id,
                    employeeId: a.employeeId ?? "",
                    amount: Number(a.amount),
                    reason: a.reason,
                    givenAt: a.givenAt.toISOString().slice(0, 10),
                    notes: a.notes,
                  }}
                />
              )}
            </ListRow>
          ))}
        </ListShell>
      )}
    </div>
  );
}
