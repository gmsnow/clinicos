import { BarChart3 } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ReportsCharts } from "@/components/reports/reports-charts";
import { ReportActions } from "@/components/reports/report-actions";
import { ReportRangePicker } from "@/components/reports/report-range-picker";
import {
  getReportData,
  parseReportRange,
  type ReportPeriod,
} from "@/lib/reports/report-data";

export type { ReportPeriod } from "@/lib/reports/report-data";

export async function ReportsView({
  period,
  from,
  to,
}: {
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const user = await requirePermission("reports:read");
  const t = await getTranslations("reports");
  const ta = await getTranslations("appointments");
  const tb = await getTranslations("billing");
  const locale = await getLocale();

  const range = parseReportRange(from, to);
  const data = await getReportData(period, user.currentClinicId ?? "", range);

  const rangeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const rangeLabel = range
    ? range.days === 1
      ? rangeFmt.format(range.start)
      : `${rangeFmt.format(range.start)} — ${rangeFmt.format(
          new Date(range.end.getTime() - 86_400_000),
        )}`
    : null;

  const statusSplitData = data.statusSplit.map((s) => ({
    name: ta(`status_${s.status.toLowerCase()}` as never),
    value: s.value,
  }));

  const topServices = data.topServices.map((s) => ({
    name: tb(`kind_${s.kind}`),
    value: s.value,
  }));

  const visitsByDoctor = data.visitsByDoctor.map((d) => ({
    name: d.label,
    count: d.count,
  }));

  const cards = [
    { icon: "users" as const, label: t("cardsPatients"), value: data.patientsCount, tone: "primary" as const, format: "int" as const },
    { icon: "calendarCheck" as const, label: t("cardsAppointments"), value: data.appointmentsCount, tone: "info" as const, format: "int" as const },
    { icon: "stethoscope" as const, label: t("cardsEncounter"), value: data.encountersCount, tone: "violet" as const, format: "int" as const },
    { icon: "dollarSign" as const, label: t("cardsRevenue"), value: data.revenue, tone: "success" as const, format: "money" as const },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={rangeLabel ?? t(period)}
        icon={BarChart3}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ReportRangePicker from={range?.from} to={range?.to} />
            <ReportActions period={period} from={range?.from} to={range?.to} />
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((s, i) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            format={s.format}
            tone={s.tone}
            index={i}
          />
        ))}
      </div>

      <ReportsCharts
        rev14d={data.revenueSeries}
        appt7d={data.appointmentsSeries}
        statusSplit={statusSplitData}
        genderSplit={data.genderSplit}
        topServices={topServices}
        visitsByDoctor={visitsByDoctor}
        labels={{
          rev: t("revenueTrend"),
          appt: t("appointmentsTrend"),
          status: t("statusSplit"),
          gender: t("genderSplit"),
          services: t("topServices"),
          doctor: t("wardsByDoctor"),
          noData: t("noData"),
        }}
      />
    </div>
  );
}
