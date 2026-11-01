import type { Patient } from "@/lib/generated/prisma/client";
import type { ProfileCounts } from "@/lib/patient-profile/queries";
import {
  loadAllergies,
  loadClinicalNotes,
  loadDiagnoses,
  loadDocuments,
  loadFollowUps,
  loadFollowUpVisits,
  loadHistory,
  loadImaging,
  loadEncounterImagingText,
  loadInvoices,
  loadLabResults,
  loadOverview,
  loadPatientAudit,
  loadPreviousPrescriptions,
  loadProcedures,
  loadReferrals,
  loadCurrentMedications,
  loadVisitSessions,
  loadEncounterTreatments,
} from "@/lib/patient-profile/queries";
import type { ProfileTabId } from "@/lib/patient-profile/tabs";
import { OverviewTab } from "@/components/patients/profile/tabs/overview-tab";
import { HistoryTab } from "@/components/patients/profile/tabs/history-tab";
import { DiagnosesTab } from "@/components/patients/profile/tabs/diagnoses-tab";
import { AllergiesTab } from "@/components/patients/profile/tabs/allergies-tab";
import { MedicationsTab } from "@/components/patients/profile/tabs/medications-tab";
import { AppointmentsTab } from "@/components/patients/profile/tabs/appointments-tab";
import { LabTab } from "@/components/patients/profile/tabs/lab-tab";
import { ImagingTab } from "@/components/patients/profile/tabs/imaging-tab";
import { ProceduresTab } from "@/components/patients/profile/tabs/procedures-tab";
import { NotesTab } from "@/components/patients/profile/tabs/notes-tab";
import { VitalsTab } from "@/components/patients/profile/tabs/vitals-tab";
import { DocumentsTab } from "@/components/patients/profile/tabs/documents-tab";
import { BillingTab } from "@/components/patients/profile/tabs/billing-tab";
import { ReferralsTab } from "@/components/patients/profile/tabs/referrals-tab";
import { AuditTab } from "@/components/patients/profile/tabs/audit-tab";
import { getTranslations } from "next-intl/server";

export type ProfilePermissions = {
  clinical: boolean;
  sign: boolean;
  admin: boolean;
  audit: boolean;
};

export async function ProfilePanel({
  tab,
  clinicId,
  patientId,
  patient,
  counts,
  locale,
  permissions,
}: {
  tab: ProfileTabId;
  clinicId: string;
  patientId: string;
  patient: Patient;
  counts: ProfileCounts;
  locale: string;
  permissions: ProfilePermissions;
}) {
  const t = await getTranslations("patients");

  switch (tab) {
    case "overview": {
      const data = await loadOverview(clinicId, patientId);
      return <OverviewTab patient={patient} data={data} counts={counts} locale={locale} />;
    }
    case "history": {
      const [items, sessions] = await Promise.all([
        loadHistory(clinicId, patientId),
        loadVisitSessions(clinicId, patientId),
      ]);
      return (
        <HistoryTab items={items} sessions={sessions} locale={locale} />
      );
    }
    case "diagnoses": {
      const items = await loadDiagnoses(clinicId, patientId);
      return <DiagnosesTab items={items} locale={locale} />;
    }
    case "allergies": {
      const items = await loadAllergies(clinicId, patientId);
      return <AllergiesTab items={items} locale={locale} />;
    }
    case "medications": {
      const [currentItems, previousItems, treatments] = await Promise.all([
        loadCurrentMedications(clinicId, patientId),
        loadPreviousPrescriptions(clinicId, patientId),
        loadEncounterTreatments(clinicId, patientId),
      ]);
      return (
        <MedicationsTab
          currentItems={[...currentItems, ...treatments] as any}
          previousItems={previousItems as any}
          locale={locale}
        />
      );
    }
    case "lab": {
      const items = await loadLabResults(clinicId, patientId);
      return <LabTab items={items} locale={locale} />;
    }
    case "imaging": {
      const [items, imagingTextItems] = await Promise.all([
        loadImaging(clinicId, patientId),
        loadEncounterImagingText(clinicId, patientId),
      ]);
      return <ImagingTab items={[...items, ...imagingTextItems] as any} locale={locale} />;
    }
    case "procedures": {
      const items = await loadProcedures(clinicId, patientId);
      return <ProceduresTab items={items} locale={locale} />;
    }
    case "notes": {
      const items = await loadClinicalNotes(clinicId, patientId);
      return <NotesTab items={items} locale={locale} />;
    }
    case "documents": {
      const items = await loadDocuments(clinicId, patientId);
      return <DocumentsTab items={items} locale={locale} patientId={patientId} />;
    }
    case "billing": {
      const items = await loadInvoices(clinicId, patientId);
      return <BillingTab items={items} locale={locale} />;
    }
    case "followup": {
      const [items, visits] = await Promise.all([
        loadFollowUps(clinicId, patientId),
        loadFollowUpVisits(clinicId, patientId),
      ]);
      return <AppointmentsTab items={items} visits={visits as any} locale={locale} followUpOnly />;
    }
    case "referrals": {
      const items = await loadReferrals(clinicId, patientId);
      return <ReferralsTab items={items} locale={locale} />;
    }
    case "audit": {
      if (!permissions.audit) {
        return <AuditTab items={[]} locale={locale} canRead={false} />;
      }
      const items = await loadPatientAudit(clinicId, patientId);
      return <AuditTab items={items} locale={locale} canRead />;
    }
    default:
      return null;
  }
}