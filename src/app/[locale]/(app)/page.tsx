import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { addDays, parseISODate, toISODate } from "@/lib/dates";
import { fmtDate, fmtInt, fmtMoney, fmtTime, toNumber } from "@/lib/format";
import { displayName } from "@/lib/patient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard, type StatHref, type StatIcon, type StatTone } from "@/components/dashboard/stat-card";
import {
  RevenuePanel,
  type SummaryItem,
} from "@/components/dashboard/revenue-panel";
import {
  BreakdownDonut,
  RegistrationsLineChart,
  type Point,
  type Slice,
} from "@/components/dashboard/charts/charts";
import { ChartFrame, ChartLegend } from "@/components/dashboard/charts/chart-kit";
import { LiveQueue, type QueueItem } from "@/components/dashboard/live-queue";
import { TasksWidget } from "@/components/dashboard/tasks-widget";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CreditCard,
  PiggyBank,
  Receipt,
  Repeat,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  User,
  UserPlus,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--primary)",
] as const;

const paletteAt = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length]!;

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--success)",
  IN_SERVICE: "var(--info)",
  ARRIVED: "var(--warning)",
  CONFIRMED: "var(--chart-2)",
  SCHEDULED: "var(--primary)",
  CANCELLED: "var(--destructive)",
  NO_SHOW: "var(--muted-foreground)",
};

function pctDelta(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? { value: 100, direction: "up" as const } : undefined;
  const change = ((current - previous) / previous) * 100;
  return {
    value: change,
    direction:
      change > 0.5 ? ("up" as const) : change < -0.5 ? ("down" as const) : ("flat" as const),
  };
}

/** Month buckets used by the revenue and patient-growth charts (oldest first). */
function monthBuckets(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1));
    return { key: d.toISOString().slice(0, 7), start: d };
  });
}

function monthLabel(key: string, locale: string) {
  const parts = key.split("-");
  const y = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 1);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function Tile({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: typeof UsersRound;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-3 text-center transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
      style={{ ["--tile" as string]: color }}
    >
      <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
        <span style={{ color: "var(--tile)" }}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums" style={{ color: "var(--tile)" }}>
        {fmtInt(value)}
      </p>
    </div>
  );
}

function BigStat({
  value,
  label,
  color,
  icon: Icon,
  className,
}: {
  value: number;
  label: string;
  color: string;
  icon: typeof Receipt;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent
        className="flex flex-col items-center justify-center gap-1 py-8"
        style={{ ["--tile" as string]: color }}
      >
        <span
          className="flex size-12 items-center justify-center rounded-full"
          style={{
            background: "color-mix(in srgb, var(--tile) 12%, transparent)",
            color: "var(--tile)",
          }}
        >
          <Icon className="size-6" aria-hidden />
        </span>
        <p className="text-3xl font-extrabold tabular-nums">{fmtInt(value)}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon: typeof Wallet;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
          }}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

type PatientRow = {
  id: string;
  firstNameAr: string;
  lastNameAr: string;
  firstNameEn: string | null;
  lastNameEn: string | null;
  phone: string | null;
  gender: string;
  createdAt: Date;
};

function RecentPatients({
  items,
  labels,
  locale,
}: {
  items: PatientRow[];
  labels: { title: string; viewAll: string; empty: string };
  locale: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="truncate text-sm font-semibold">{labels.title}</CardTitle>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Link href="/patients">
            {labels.viewAll}
            <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.empty}</p>
        ) : (
          <ul className="flex flex-col">
            {items.map((p, i) => (
              <li
                key={p.id}
                className={`flex items-center gap-3 px-0 py-2 ${i < items.length - 1 ? "border-b" : ""}`}
              >
                <Link
                  href={`/patients/${p.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 hover:underline"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {displayName(p, locale).charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {displayName(p, locale)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                      {p.phone ?? "—"}
                    </span>
                  </span>
                </Link>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                  {p.gender === "MALE" ? "♂" : "♀"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type AppointmentRow = {
  id: string;
  startTime: Date;
  status: string;
  patient: {
    id: string;
    firstNameAr: string;
    lastNameAr: string;
    firstNameEn: string | null;
    lastNameEn: string | null;
  };
  doctor: { name: string } | null;
};

function RecentAppointments({
  items,
  labels,
  locale,
}: {
  items: AppointmentRow[];
  labels: {
    title: string;
    viewAll: string;
    empty: string;
    patient: string;
    doctor: string;
    date: string;
    status: string;
  };
  locale: string;
}) {
  const statusLabel = (s: string) =>
    ({
      SCHEDULED: "مجدول",
      CONFIRMED: "مؤكد",
      ARRIVED: "حضر",
      IN_SERVICE: "قيد الخدمة",
      COMPLETED: "مكتمل",
      CANCELLED: "ملغى",
      NO_SHOW: "لم يحضر",
    })[s] ?? s;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="truncate text-sm font-semibold">{labels.title}</CardTitle>
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Link href="/appointments">
            {labels.viewAll}
            <ArrowRight className="size-3 rtl:rotate-180" aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                {[
                  { label: labels.patient, className: "" },
                  { label: labels.doctor, className: "hidden md:table-cell" },
                  { label: labels.date, className: "" },
                  { label: labels.status, className: "" },
                ].map((h) => (
                  <th
                    key={h.label}
                    className={`whitespace-nowrap px-3 py-2 text-start text-xs font-semibold text-muted-foreground ${h.className}`}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    {labels.empty}
                  </td>
                </tr>
              ) : (
                items.map((a) => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link
                        href={`/patients/${a.patient.id}`}
                        className="flex items-center gap-2 hover:underline"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {displayName(a.patient, locale).charAt(0)}
                        </span>
                        <span className="truncate font-medium">
                          {displayName(a.patient, locale)}
                        </span>
                      </Link>
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground md:table-cell">
                      {a.doctor?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {fmtDate(a.startTime, locale)} {fmtTime(a.startTime)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: `color-mix(in srgb, ${STATUS_COLOR[a.status] ?? "var(--muted-foreground)"} 14%, transparent)`,
                          color: STATUS_COLOR[a.status] ?? "var(--muted-foreground)",
                        }}
                        dir="rtl"
                      >
                        {statusLabel(a.status)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const ta = await getTranslations("appointments");
  const locale = await getLocale();
  const user = await requireUser();
  const clinicId = user.currentClinicId ?? "";
  const canAddPatient = await can(user, "patients:write");

  const todayStart = parseISODate(toISODate(new Date()));
  const todayEnd = addDays(todayStart, 1);
  const yesterdayStart = addDays(todayStart, -1);
  const weekStart = addDays(todayStart, -6);
  const prevWeekStart = addDays(todayStart, -13);
  const monthStart = addDays(todayStart, -29);
  const prevMonthStart = addDays(todayStart, -59);
  const buckets = monthBuckets(6);
  const periodStart = buckets[0]!.start;

  const noData = t("noData");
  const numLocale = locale === "ar" ? "ar-EG" : "en-US";
  const fmtN = (n: number) => new Intl.NumberFormat(numLocale).format(Math.round(n));

  const [
    clinic,
    totalPatients,
    patientsBefore30d,
    patientsByGender,
    patientRows,
    payRows,
    openInvoices,
    totalSessions,
    totalAppointments,
    statusRows,
    typeRows,
    queueRows,
    recentPatients,
    recentAppointments,
    taskRows,
    encountersMonth,
    encountersByTypeMonth,
  ] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: clinicId }, select: { timezone: true } }),
    prisma.patient.count({ where: { clinicId } }),
    prisma.patient.count({ where: { clinicId, createdAt: { lt: monthStart } } }),
    prisma.patient.groupBy({
      by: ["gender"],
      where: { clinicId },
      _count: { _all: true },
    }),
    prisma.patient.findMany({
      where: { clinicId, createdAt: { gte: periodStart } },
      select: { createdAt: true, price: true },
    }),
    prisma.payment.findMany({
      where: { invoice: { clinicId }, paidAt: { gte: periodStart } },
      select: { amount: true, paidAt: true },
    }),
    prisma.invoice.findMany({
      where: { clinicId, status: "OPEN" },
      select: { total: true, paidAmount: true },
    }),
    prisma.encounter.count({ where: { clinicId } }),
    prisma.appointment.count({ where: { clinicId } }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { clinicId, startTime: { gte: monthStart, lt: todayEnd } },
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["type"],
      where: { clinicId, startTime: { gte: monthStart, lt: todayEnd } },
      _count: { _all: true },
    }),
    prisma.appointment.findMany({
      where: {
        clinicId,
        startTime: { gte: todayStart, lt: todayEnd },
        status: { in: ["ARRIVED", "IN_SERVICE", "SCHEDULED", "CONFIRMED"] },
      },
      select: {
        id: true,
        status: true,
        startTime: true,
        patient: { select: { firstNameAr: true, lastNameAr: true, firstNameEn: true, lastNameEn: true } },
      },
      orderBy: { startTime: "asc" },
      take: 6,
    }),
    prisma.patient.findMany({
      where: { clinicId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        firstNameAr: true,
        lastNameAr: true,
        firstNameEn: true,
        lastNameEn: true,
        phone: true,
        gender: true,
        createdAt: true,
      },
    }),
    prisma.appointment.findMany({
      where: { clinicId },
      orderBy: { startTime: "desc" },
      take: 8,
      select: {
        id: true,
        startTime: true,
        status: true,
        patient: {
          select: {
            id: true,
            firstNameAr: true,
            lastNameAr: true,
            firstNameEn: true,
            lastNameEn: true,
          },
        },
        doctor: { select: { name: true } },
      },
    }),
    prisma.task.findMany({
      where: { clinicId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    prisma.encounter.count({
      where: { clinicId, createdAt: { gte: monthStart, lt: todayEnd } },
    }),
    prisma.encounter.groupBy({
      by: ["type"],
      where: { clinicId, createdAt: { gte: monthStart, lt: todayEnd } },
      _count: { _all: true },
    }),
  ]);

  const inRange = (d: Date, from: Date, to: Date) =>
    d.getTime() >= from.getTime() && d.getTime() < to.getTime();

  const sum = (from: Date, to: Date) =>
    payRows.reduce(
      (s, p) => (inRange(new Date(p.paidAt), from, to) ? s + toNumber(p.amount) : s),
      0,
    ) +
    patientRows.reduce(
      (s, p) => (inRange(new Date(p.createdAt), from, to) ? s + toNumber(p.price) : s),
      0,
    );

  const countPatients = (from: Date, to: Date) =>
    patientRows.reduce((s, p) => (inRange(new Date(p.createdAt), from, to) ? s + 1 : s), 0);

  const revenueToday = sum(todayStart, todayEnd);
  const revenueYesterday = sum(yesterdayStart, todayStart);
  const revenueWeek = sum(weekStart, todayEnd);
  const revenuePrevWeek = sum(prevWeekStart, weekStart);
  const revenueMonth = sum(monthStart, todayEnd);
  const revenuePrevMonth = sum(prevMonthStart, monthStart);

  const patientsToday = countPatients(todayStart, todayEnd);
  const patientsWeek = countPatients(weekStart, todayEnd);
  const patientsMonth = countPatients(monthStart, todayEnd);
  const males = patientsByGender.find((g) => g.gender === "MALE")?._count._all ?? 0;
  const females = patientsByGender.find((g) => g.gender === "FEMALE")?._count._all ?? 0;

  const outstanding = openInvoices.reduce(
    (acc, inv) => acc + Math.max(0, toNumber(inv.total) - toNumber(inv.paidAmount)),
    0,
  );

  const monthlyRevenue: Point[] = buckets.map((b) => {
    const next = new Date(b.start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return {
      label: monthLabel(b.key, locale),
      value: Math.round(sum(b.start, next) * 100) / 100,
    };
  });

  const monthlyPatients: Point[] = buckets.map((b) => {
    const next = new Date(b.start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return { label: monthLabel(b.key, locale), value: countPatients(b.start, next) };
  });

  const statusLabels: Record<string, string> = {
    SCHEDULED: ta("status_scheduled"),
    CONFIRMED: ta("status_confirmed"),
    ARRIVED: ta("status_arrived"),
    IN_SERVICE: ta("status_in_service"),
    COMPLETED: ta("status_completed"),
    CANCELLED: ta("status_cancelled"),
    NO_SHOW: ta("status_no_show"),
  };
  const typeLabels: Record<string, string> = {
    INITIAL: ta("type_INITIAL"),
    FOLLOW_UP: ta("type_FOLLOW_UP"),
    CONSULTATION: ta("type_CONSULTATION"),
    VACCINATION: ta("type_VACCINATION"),
    PROCEDURE: ta("type_PROCEDURE"),
    RE_EVALUATION: ta("type_RE_EVALUATION"),
  };

  const byStatus: Slice[] = (
    ["COMPLETED", "IN_SERVICE", "ARRIVED", "CONFIRMED", "SCHEDULED", "CANCELLED", "NO_SHOW"] as const
  )
    .map((key) => ({
      key,
      label: statusLabels[key] ?? key,
      value: statusRows.find((r) => r.status === key)?._count._all ?? 0,
    }))
    .filter((s) => s.value > 0);

  const byType: Slice[] = (
    ["CONSULTATION", "FOLLOW_UP", "INITIAL", "PROCEDURE", "VACCINATION", "RE_EVALUATION"] as const
  )
    .map((key) => ({
      key,
      label: typeLabels[key] ?? key,
      value: typeRows.find((r) => r.type === key)?._count._all ?? 0,
    }))
    .filter((s) => s.value > 0);

  const queue: QueueItem[] = queueRows.map((a) => ({
    id: a.id,
    name: displayName(a.patient, locale),
    time: fmtTime(a.startTime),
    status:
      a.status === "IN_SERVICE" ? "IN_SERVICE" : a.status === "ARRIVED" ? "WAITING" : "UPCOMING",
  }));

  const greetingHour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: clinic?.timezone ?? undefined,
    }).format(new Date()),
  );
  const greetingKey =
    greetingHour < 12 ? "greetingMorning" : greetingHour < 17 ? "greetingAfternoon" : "greetingEvening";

  const stats: {
    icon: StatIcon;
    label: string;
    value: number;
    format: "int" | "money";
    tone: StatTone;
    delta?: { value: number; direction: "up" | "down" | "flat" };
    deltaLabel?: string;
    href: StatHref;
  }[] = [
    {
      icon: "users",
      label: t("statTotalPatients"),
      value: totalPatients,
      format: "int",
      tone: "primary",
      delta: pctDelta(totalPatients, patientsBefore30d),
      deltaLabel: t("vsYesterday"),
      href: "/patients",
    },
    {
      icon: "wallet",
      label: t("statDailyIncome"),
      value: revenueToday,
      format: "money",
      tone: "success",
      delta: pctDelta(revenueToday, revenueYesterday),
      deltaLabel: t("vsYesterday"),
      href: "/reports/daily",
    },
    {
      icon: "dollarSign",
      label: t("statWeeklyIncome"),
      value: revenueWeek,
      format: "money",
      tone: "violet",
      delta: pctDelta(revenueWeek, revenuePrevWeek),
      deltaLabel: t("vsLastWeek"),
      href: "/reports/weekly",
    },
    {
      icon: "trending",
      label: t("statMonthlyIncome"),
      value: revenueMonth,
      format: "money",
      tone: "warning",
      delta: pctDelta(revenueMonth, revenuePrevMonth),
      deltaLabel: t("vsLastMonth"),
      href: "/reports/monthly",
    },
  ];

  const tiles = [
    { label: t("dailyPatients"), value: patientsToday, color: "#3e5679", icon: UsersRound },
    { label: t("weeklyPatients"), value: patientsWeek, color: "#2e7d32", icon: UsersRound },
    { label: t("monthlyPatients"), value: patientsMonth, color: "#7c4dff", icon: UsersRound },
    { label: t("totalMales"), value: males, color: "#00838f", icon: User },
    { label: t("totalFemales"), value: females, color: "#e65100", icon: UserRound },
  ];

  const summaries: SummaryItem[] = [
    { label: t("revenueToday"), value: fmtMoney(revenueToday), color: "#2e7d32" },
    { label: t("revenueWeek"), value: fmtMoney(revenueWeek), color: "#7c4dff" },
    { label: t("revenueMonth"), value: fmtMoney(revenueMonth), color: "#3e5679" },
    { label: t("outstandingBalances"), value: fmtMoney(outstanding), color: "#e65100" },
    { label: t("totalSessions"), value: fmtN(totalSessions), color: "#f59e0b" },
  ];

  const statusLegend = byStatus.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    color: STATUS_COLOR[s.key] ?? "var(--muted-foreground)",
  }));

  const typeLegend = byType.map((s, i) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    color: paletteAt(i),
  }));

  const expenses = 0;
  const netProfit = revenueMonth - expenses;
  const subscriptions = 0;
  const finance = [
    { key: "revenue", label: t("totalRevenue"), value: fmtMoney(revenueMonth), color: "#2e7d32", icon: Wallet },
    { key: "expenses", label: t("expenses"), value: fmtMoney(expenses), color: "#e65100", icon: TrendingDown },
    { key: "profit", label: t("netProfit"), value: fmtMoney(netProfit), color: "#7c4dff", icon: PiggyBank },
    { key: "subscriptions", label: t("subscriptions"), value: fmtMoney(subscriptions), color: "#00838f", icon: CreditCard },
  ];

  const followUpMonth =
    encountersByTypeMonth.find((e) => e.type === "FOLLOW_UP")?._count._all ?? 0;
  const newMonth = Math.max(0, encountersMonth - followUpMonth);
  const sessionStats = [
    { key: "lifetime", label: t("totalSessions"), sub: t("lifetime"), value: fmtInt(totalSessions), color: "#3e5679", icon: Stethoscope },
    { key: "month", label: t("sessionsMonth"), sub: t("financeRange"), value: fmtInt(encountersMonth), color: "#7c4dff", icon: Activity },
    { key: "new", label: ta("type_INITIAL"), sub: t("financeRange"), value: fmtInt(newMonth), color: "#2e7d32", icon: UserPlus },
    { key: "followup", label: ta("type_FOLLOW_UP"), sub: t("financeRange"), value: fmtInt(followUpMonth), color: "#e65100", icon: Repeat },
  ];

  const tasks = taskRows.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* Greeting + primary action */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t(greetingKey)}, {user.name}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("welcome")}</p>
        </div>
        {canAddPatient && (
          <Button asChild size="sm">
            <Link href="/patients/new">
              <UserPlus />
              {t("addPatient")}
            </Link>
          </Button>
        )}
      </div>

      {/* Four headline stats */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((s, i) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            label={s.label}
            value={s.value}
            format={s.format}
            locale={numLocale}
            tone={s.tone}
            delta={s.delta}
            deltaLabel={s.deltaLabel}
            href={s.href}
            index={i}
          />
        ))}
      </div>

      {/* Patient tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>

      {/* Revenue + patient growth */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <RevenuePanel title={t("revenue")} monthly={monthlyRevenue} summaries={summaries} noData={noData} />
        </div>
        <ChartFrame
          title={t("patientGrowth")}
          icon={<TrendingUp className="size-4" aria-hidden />}
          className="min-w-0 lg:col-span-4"
          index={1}
        >
          <RegistrationsLineChart data={monthlyPatients} emptyLabel={noData} />
          <div className="mt-2 flex justify-around text-center">
            <div>
              <p className="text-xs text-muted-foreground">{t("statTotalPatients")}</p>
              <p className="text-lg font-bold tabular-nums">{fmtInt(totalPatients)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t("totalSessions")}</p>
              <p className="text-lg font-bold tabular-nums">{fmtInt(totalSessions)}</p>
            </div>
          </div>
        </ChartFrame>
      </div>

      {/* Financial summary */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("financeTitle")}</h2>
          <span className="text-xs text-muted-foreground">{t("financeRange")}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {finance.map((f) => (
            <MetricCard key={f.key} label={f.label} value={f.value} color={f.color} icon={f.icon} />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{t("financeNote")}</p>
      </div>

      {/* Session statistics */}
      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">{t("sessionStats")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sessionStats.map((s) => (
            <MetricCard
              key={s.key}
              label={s.label}
              value={s.value}
              sub={s.sub}
              color={s.color}
              icon={s.icon}
            />
          ))}
        </div>
      </div>

      {/* Types / statuses / recent patients */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame
          title={t("appointmentTypes")}
          icon={<Activity className="size-4" aria-hidden />}
          className="min-w-0"
          index={2}
        >
          <BreakdownDonut data={byType} emptyLabel={noData} />
        </ChartFrame>

        <ChartFrame
          title={t("appointmentStatus")}
          icon={<ArrowUpRight className="size-4" aria-hidden />}
          className="min-w-0"
          index={3}
        >
          {statusLegend.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{noData}</p>
          ) : (
            <div className="flex flex-col gap-3 py-3">
              {statusLegend.map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: s.color }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                  <span className="shrink-0 tabular-nums">{fmtInt(s.value)}</span>
                </div>
              ))}
            </div>
          )}
        </ChartFrame>

        <RecentPatients
          items={recentPatients}
          labels={{
            title: t("recentPatients"),
            viewAll: t("viewAll"),
            empty: t("noPatients"),
          }}
          locale={locale}
        />
      </div>

      {/* Recent appointments + tasks */}
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-8">
          <RecentAppointments
            items={recentAppointments}
            labels={{
              title: t("recentAppointments"),
              viewAll: t("viewAll"),
              empty: t("noAppointments"),
              patient: ta("patient"),
              doctor: ta("doctor"),
              date: ta("date"),
              status: ta("status"),
            }}
            locale={locale}
          />
        </div>
        <div className="min-w-0 lg:col-span-4">
          <TasksWidget initialTasks={tasks} />
        </div>
      </div>

      {/* Type breakdown + live queue */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="min-w-0 lg:col-span-8">
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("appointmentTypes")}</CardTitle>
          </CardHeader>
          <CardContent>
            {typeLegend.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{noData}</p>
            ) : (
              <ChartLegend items={typeLegend} className="mt-0" />
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 lg:col-span-4">
          <LiveQueue
            items={queue}
            labels={{
              title: t("liveQueue"),
              empty: t("queueEmpty"),
              viewAll: t("viewLiveQueue"),
              status: {
                waiting: t("statusWaiting"),
                inService: t("statusInService"),
                upcoming: t("statusUpcoming"),
              },
            }}
          />
        </div>
      </div>

      {/* Headline totals */}
      <div className="grid gap-4 lg:grid-cols-12">
        <BigStat
          className="min-w-0 lg:col-span-6"
          value={totalSessions}
          label={t("totalSessions")}
          color="#7c4dff"
          icon={Receipt}
        />
        <BigStat
          className="min-w-0 lg:col-span-6"
          value={totalAppointments}
          label={t("totalAppointments")}
          color="#e65100"
          icon={ArrowUpRight}
        />
      </div>
    </div>
  );
}
