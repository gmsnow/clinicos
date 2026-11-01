import { TrendingDown } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { ListShell, ListRow } from "@/components/data/list-shell";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  ExpenseDialog,
  type ExpenseLabels,
} from "@/components/expenses/expense-dialog";
import { ExpenseRowActions } from "@/components/expenses/expense-row-actions";
import { createExpense } from "./actions";

export default async function ExpensesPage() {
  const user = await requirePermission("accounting:read");
  const locale = await getLocale();
  const t = await getTranslations("expenses");
  const tc = await getTranslations("common");
  const canWrite = await can(user, "accounting:write");
  const clinicId = user.currentClinicId;

  const labels: ExpenseLabels = {
    add: t("add"),
    edit: t("edit"),
    description: t("description"),
    amount: t("amount"),
    category: t("category"),
    paidAt: t("paidAt"),
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

  const expenses = clinicId
    ? await prisma.expense.findMany({
        where: { clinicId },
        include: { paidBy: { select: { name: true, nameAr: true } } },
        orderBy: { paidAt: "desc" },
        take: 200,
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        icon={TrendingDown}
        actions={canWrite ? <ExpenseDialog action={createExpense} labels={labels} /> : undefined}
      />
      {expenses.length === 0 ? (
        <EmptyState icon={TrendingDown} title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <ListShell>
          {expenses.map((e, i) => (
            <ListRow key={e.id} index={i}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">{e.description}</span>
                <span className="text-xs text-muted-foreground">
                  {[e.category, e.paidBy?.nameAr || e.paidBy?.name].filter(Boolean).join(" · ")}
                </span>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {fmtMoney(Number(e.amount))}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {fmtDate(e.paidAt, locale)}
              </span>
              {canWrite && (
                <ExpenseRowActions
                  labels={labels}
                  expense={{
                    id: e.id,
                    description: e.description ?? "",
                    amount: Number(e.amount),
                    category: e.category,
                    paidAt: e.paidAt.toISOString().slice(0, 10),
                    notes: e.notes,
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
