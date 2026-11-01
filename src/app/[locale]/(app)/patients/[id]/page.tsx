import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import { resolveProfileTab } from "@/lib/patient-profile/tabs";
import { getProfileCounts } from "@/lib/patient-profile/queries";
import { recordPatientView } from "@/app/[locale]/(app)/patients/identity-actions";
import { PatientIdentity } from "@/components/patients/profile/patient-identity";
import { PatientProfileTabs } from "@/components/patients/profile/patient-profile-tabs";
import { ProfilePanel } from "@/components/patients/profile/profile-panel";

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  try {
    const user = await requirePermission("patients:read");
    const { id } = await params;
    const { tab } = await searchParams;
    const locale = await getLocale();
    let clinicId = user.currentClinicId ?? "";
    if (!clinicId) {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { clinicId: true, currentClinicId: true },
      });
      clinicId = dbUser?.currentClinicId ?? dbUser?.clinicId ?? "";
    }
    const activeTab = resolveProfileTab(tab);

    const patient = await prisma.patient.findFirst({
      where: { id, clinicId },
    });
    if (!patient) notFound();

  await recordPatientView(patient.id);

  const [counts, canAdmin, canClinical, canSign, canAudit] = await Promise.all([
    getProfileCounts(clinicId, id),
    can(user, "patients:write"),
    can(user, "encounters:write"),
    can(user, "encounters:sign"),
    can(user, "audit:read"),
  ]);

    return (
      <div className="flex flex-col gap-6">
        <PatientIdentity
          patient={patient}
          locale={locale}
          canWrite={canAdmin}
        />

        <PatientProfileTabs active={activeTab} counts={counts} />

        <ProfilePanel
          tab={activeTab}
          clinicId={clinicId}
          patientId={id}
          patient={patient}
          counts={counts}
          locale={locale}
          permissions={{
            clinical: canClinical,
            sign: canSign,
            admin: canAdmin,
            audit: canAudit,
          }}
        />
      </div>
    );
  } catch (e) {
    console.error("PatientDetailPage error:", e);
    throw e;
  }
}