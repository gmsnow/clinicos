import { Stethoscope, ReceiptText, FolderOpen, Printer } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import { displayName } from "@/lib/patient";
import { EncounterChart } from "@/components/encounters/encounter-chart";
import { serializeEncounter } from "@/components/encounters/serialize";
import { PatientSummaryHeader } from "@/components/encounters/patient-summary-header";
import { ResultsReviewBanner } from "@/components/encounters/results-review-banner";
import { VisitClosure } from "@/components/encounters/visit-closure";
import { EncounterInvoiceButton } from "@/components/billing/encounter-invoice-button";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { headers } from "next/headers";

export default async function EncounterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("encounters:read");
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations("encounters");
  const clinicId = user.currentClinicId ?? "";
  const canWrite = await can(user, "encounters:write");
  const canSign = await can(user, "encounters:sign");
  const canAmend = await can(user, "encounters:amend");
  const canBill = await can(user, "billing:write");
  const canViewPatient = await can(user, "patients:read");
  const tp = await getTranslations("patients");
  const tb = await getTranslations("billing");

  const requestHeaders = await headers();
  const requestHost = (
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    ""
  )
    .split(",")[0]
    ?.trim()
    .split(":")[0]
    ?.toLowerCase();
  const projectHost = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim().toLowerCase();
  const showSkeleton3D =
    requestHost === "clinicos-ye.vercel.app" || projectHost === "clinicos-ye.vercel.app";

  const encounter = await prisma.encounter.findFirst({
    where: { id, clinicId },
    include: {
      patient: true,
      doctor: { select: { name: true } },
      diagnoses: true,
      orders: {
        include: {
          labRequest: {
            select: {
              id: true,
              status: true,
              tests: {
                where: { status: { in: ["RESULTED", "VERIFIED"] } },
                select: { testName: true, resultValue: true, unit: true, isAbnormal: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
          imagingRequest: {
            select: { id: true, status: true, modality: true, findings: true, impression: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!encounter) notFound();

  const visit = await prisma.visit.findFirst({
    where: { encounterId: id, clinicId },
    select: { status: true },
  });

  const chart = serializeEncounter(encounter);
  const hasPendingOrders = encounter.orders.some((o) => o.status === "PENDING");
  const encounterClosed =
    encounter.status === "COMPLETED" || encounter.status === "SIGNED" || encounter.status === "AMENDED";
  const encounterInvoice = await prisma.invoice.findFirst({
    where: { encounterId: id, clinicId },
    select: { id: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={displayName(encounter.patient, locale)}
        icon={Stethoscope}
        description={`${encounter.patient.mrn} · ${t("visit")}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/encounters/${id}/report`} target="_blank">
                <Printer />
                {t("printReport")}
              </Link>
            </Button>
            {canViewPatient ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/patients/${encounter.patientId}`}>
                  <FolderOpen />
                  {tp("profile")}
                </Link>
              </Button>
            ) : null}
            <EncounterInvoiceButton
              encounterId={id}
              hasInvoice={!!encounterInvoice}
              invoiceId={encounterInvoice?.id ?? null}
              canBill={canBill}
            />
            {canBill ? (
              <Button asChild size="sm">
                <Link href={`/billing/new?patient=${encounter.patientId}`}>
                  <ReceiptText />
                  {tb("fromEncounter")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <PatientSummaryHeader
        patientName={displayName(encounter.patient, locale)}
        mrn={encounter.patient.mrn}
        photo={encounter.patient.photo}
        birthDate={encounter.patient.birthDate}
        bloodType={encounter.patient.bloodType}
        insuranceCompany={encounter.patient.insuranceCompany}
        insurancePolicyNumber={encounter.patient.insurancePolicyNumber}
      />
      {visit?.status === "AWAITING_RESULTS" && (
        <ResultsReviewBanner encounterId={id} show />
      )}
      <EncounterChart
        encounter={chart}
        canWrite={canWrite}
        canSign={canSign}
        canAmend={canAmend}
        showSkeleton3D={showSkeleton3D}
      />
      {!encounterClosed && (
        <div className="flex justify-end">
          <VisitClosure
            encounterId={id}
            readOnly={!canWrite}
            hasPendingOrders={hasPendingOrders}
          />
        </div>
      )}
    </div>
  );
}