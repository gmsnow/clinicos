import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import {
  getReportData,
  parseReportRange,
  REPORT_PERIODS,
  type ReportPeriod,
} from "@/lib/reports/report-data";
import { generateReportPdf } from "@/lib/reports/report-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isPeriod(value: string): value is ReportPeriod {
  return (REPORT_PERIODS as string[]).includes(value);
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ period: string }> },
) {
  const { period } = await ctx.params;
  if (!isPeriod(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 404 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await can(user, "reports:read"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ar";
  const range = parseReportRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  const clinicId = user.currentClinicId ?? "";

  const [data, clinic, t, ta, tb] = await Promise.all([
    getReportData(period, clinicId, range),
    clinicId
      ? prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { nameAr: true, nameEn: true },
        })
      : Promise.resolve(null),
    getTranslations({ locale, namespace: "reports" }),
    getTranslations({ locale, namespace: "appointments" }),
    getTranslations({ locale, namespace: "billing" }),
  ]);

  const statusRows = data.statusSplit.map((s) => ({
    name: ta(`status_${s.status.toLowerCase()}` as never),
    value: s.value,
  }));
  const serviceRows = data.topServices.map((s) => ({
    name: tb(`kind_${s.kind}` as never),
    value: s.value,
  }));

  try {
    const pdf = await generateReportPdf({
      data,
      locale,
      clinicName: (locale === "en" ? clinic?.nameEn : clinic?.nameAr) ?? clinic?.nameAr ?? "",
      generatedBy: user.name,
      statusRows,
      serviceRows,
      labels: {
        title: t("title"),
        periodName: range ? t("customRange") : t(period),
        cardsPatients: t("cardsPatients"),
        cardsAppointments: t("cardsAppointments"),
        cardsEncounter: t("cardsEncounter"),
        cardsRevenue: t("cardsRevenue"),
        revenueTrend: t("revenueTrend"),
        appointmentsTrend: t("appointmentsTrend"),
        statusSplit: t("statusSplit"),
        genderSplit: t("genderSplit"),
        topServices: t("topServices"),
        wardsByDoctor: t("wardsByDoctor"),
        noData: t("noData"),
        generatedAt: t("generatedAt"),
        reportRange: t("reportRange"),
        clinic: t("clinic"),
        generatedBy: t("generatedBy"),
      },
    });

    const filename = range
      ? `report-${period}-${range.from}_${range.to}.pdf`
      : `report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[reports/pdf] generation failed", error);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  }
}
