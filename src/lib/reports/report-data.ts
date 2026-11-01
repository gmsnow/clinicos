import { addDays, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { round2, toNumber } from "@/lib/format";

export type ReportPeriod = "daily" | "weekly" | "monthly";

export const REPORT_PERIODS: ReportPeriod[] = ["daily", "weekly", "monthly"];

export interface ReportRange {
  start: Date;
  end: Date;
  days: number;
  from: string;
  to: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportRange(
  from?: string | null,
  to?: string | null,
): ReportRange | null {
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return null;

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return null;
  }

  const days = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  if (days < 1 || days > 366) return null;

  return { start: fromDate, end: addDays(toDate, 1), days, from, to };
}

export interface ReportSeriesPoint {
  label: string;
  value: number;
}

export interface ReportCountPoint {
  label: string;
  count: number;
}

export interface ReportSlice {
  name: string;
  value: number;
}

export interface ReportData {
  period: ReportPeriod;
  days: number;
  start: Date;
  end: Date;
  patientsCount: number;
  appointmentsCount: number;
  encountersCount: number;
  revenue: number;
  revenueSeries: ReportSeriesPoint[];
  appointmentsSeries: ReportCountPoint[];
  statusSplit: { status: string; value: number }[];
  genderSplit: ReportSlice[];
  topServices: { kind: string; value: number }[];
  visitsByDoctor: ReportCountPoint[];
}

export async function getReportData(
  period: ReportPeriod,
  clinicId: string,
  range?: ReportRange | null,
): Promise<ReportData> {
  const todayStart = startOfDay(new Date());

  const days = range?.days ?? (period === "daily" ? 1 : period === "weekly" ? 7 : 30);
  const start = range?.start ?? addDays(todayStart, -(days - 1));
  const rangeEnd = range?.end ?? addDays(todayStart, 1);
  const hourly = period === "daily" && days === 1;

  const dayLabel = (d: Date) =>
    new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(d);

  const bucketLabels: string[] = [];
  if (hourly) {
    for (let h = 0; h < 24; h++) {
      bucketLabels.push(`${String(h).padStart(2, "0")}:00`);
    }
  } else {
    for (let i = 0; i < days; i++) bucketLabels.push(dayLabel(addDays(start, i)));
  }

  const bucketIndex = (d: Date): number =>
    hourly
      ? d.getHours()
      : Math.floor((startOfDay(d).getTime() - start.getTime()) / 86_400_000);

  const [
    patientsCount,
    appointmentsCount,
    encountersCount,
    payments,
    patientFees,
    appts,
    genderRows,
    items,
    encounterRows,
  ] = await Promise.all([
    prisma.patient.count({ where: { clinicId, createdAt: { gte: start, lt: rangeEnd } } }),
    prisma.appointment.count({
      where: { clinicId, startTime: { gte: start, lt: rangeEnd }, status: { not: "CANCELLED" } },
    }),
    prisma.encounter.count({
      where: { clinicId, status: "COMPLETED", completedAt: { gte: start, lt: rangeEnd } },
    }),
    prisma.payment.findMany({
      where: { invoice: { clinicId }, paidAt: { gte: start, lt: rangeEnd } },
      select: { paidAt: true, amount: true },
    }),
    prisma.patient.findMany({
      where: { clinicId, createdAt: { gte: start, lt: rangeEnd } },
      select: { createdAt: true, price: true },
    }),
    prisma.appointment.findMany({
      where: { clinicId, startTime: { gte: start, lt: rangeEnd } },
      select: { startTime: true, status: true },
    }),
    prisma.patient.groupBy({
      by: ["gender"],
      where: { clinicId, createdAt: { gte: start, lt: rangeEnd } },
      _count: { _all: true },
    }),
    prisma.invoiceItem.findMany({
      where: {
        invoice: { clinicId, status: { not: "VOID" }, createdAt: { gte: start, lt: rangeEnd } },
      },
      select: { kind: true, total: true },
    }),
    prisma.encounter.groupBy({
      by: ["doctorId"],
      where: { clinicId, status: "COMPLETED", completedAt: { gte: start, lt: rangeEnd } },
      _count: { _all: true },
    }),
  ]);

  const revenue = round2(
    payments.reduce((s, p) => s + toNumber(p.amount), 0) +
      patientFees.reduce((s, p) => s + toNumber(p.price), 0),
  );

  const revBuckets = new Array<number>(bucketLabels.length).fill(0);
  for (const p of payments) {
    const idx = bucketIndex(p.paidAt);
    if (idx >= 0 && idx < revBuckets.length) {
      revBuckets[idx] = round2(revBuckets[idx]! + toNumber(p.amount));
    }
  }
  for (const p of patientFees) {
    const idx = bucketIndex(p.createdAt);
    if (idx >= 0 && idx < revBuckets.length) {
      revBuckets[idx] = round2(revBuckets[idx]! + toNumber(p.price));
    }
  }
  const revenueSeries = revBuckets.map((value, i) => ({ label: bucketLabels[i]!, value }));

  const apptBuckets = new Array<number>(bucketLabels.length).fill(0);
  for (const a of appts) {
    const idx = bucketIndex(a.startTime);
    if (idx >= 0 && idx < apptBuckets.length) apptBuckets[idx] = apptBuckets[idx]! + 1;
  }
  const appointmentsSeries = apptBuckets.map((count, i) => ({
    label: bucketLabels[i]!,
    count,
  }));

  const statusTotals = new Map<string, number>();
  for (const a of appts) {
    statusTotals.set(a.status, (statusTotals.get(a.status) ?? 0) + 1);
  }
  const statusSplit = [...statusTotals.entries()].map(([status, value]) => ({
    status,
    value,
  }));

  const genderSplit = genderRows.map((row) => ({
    name: row.gender === "MALE" ? "M" : row.gender === "FEMALE" ? "F" : "—",
    value: row._count._all,
  }));

  const kindTotals = new Map<string, number>();
  for (const it of items) {
    kindTotals.set(it.kind, round2((kindTotals.get(it.kind) ?? 0) + toNumber(it.total)));
  }
  const topServices = [...kindTotals.entries()]
    .map(([kind, value]) => ({ kind, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const doctorIds = encounterRows.map((r) => r.doctorId).filter((x): x is string => Boolean(x));
  const doctorNames = doctorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: doctorIds } },
        select: { id: true, name: true },
      })
    : [];
  const doctorNameById = new Map(doctorNames.map((d) => [d.id, d.name]));
  const visitsByDoctor = encounterRows.map((r) => ({
    label: doctorNameById.get(r.doctorId ?? "") ?? "—",
    count: r._count._all,
  }));

  return {
    period,
    days,
    start,
    end: rangeEnd,
    patientsCount,
    appointmentsCount,
    encountersCount,
    revenue,
    revenueSeries,
    appointmentsSeries,
    statusSplit,
    genderSplit,
    topServices,
    visitsByDoctor,
  };
}
