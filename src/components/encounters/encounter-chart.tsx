"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CheckCircle2, FilePenLine, Pen } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import {
  encounterAction,
  saveEncounterDraft,
  updateEncounter,
  signEncounter,
  amendEncounter,
} from "@/app/[locale]/(app)/encounters/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonDiagnosis } from "@/components/encounters/skeleton-diagnosis";

export type ChartOrder = {
  id: string;
  kind: string;
  name: string;
  instructions: string | null;
  dosage: string | null;
  frequency: string | null;
  durationDays: number | null;
  quantity: string | null;
  unit: string | null;
  status: string;
  labRequestId: string | null;
  labRequestStatus: string | null;
  labResults: { testName: string; resultValue: string | null; unit: string | null; isAbnormal: boolean | null }[];
  imagingRequestId: string | null;
  imagingRequestStatus: string | null;
  imagingModality: string | null;
  imagingFindings: string | null;
  imagingImpression: string | null;
  dispensedAt: string | null;
  // Prescription fields
  drugCatalogId: string | null;
  genericName: string | null;
  brandName: string | null;
  strength: string | null;
  dosageForm: string | null;
  route: string | null;
  dose: number | null;
  doseUnit: string | null;
  frequencyCode: string | null;
  startDate: string | null;
  endDate: string | null;
  refills: number | null;
  dispenseAsWritten: boolean | null;
  clinicalIndication: string | null;
  prescriptionStatus: string | null;
  priority: string | null;
};

export type ChartDiagnosis = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  classification: string | null;
  codeSystem: string | null;
  status: string;
  course: string;
  laterality: string;
  onsetDate: string | null;
  isPrimary: boolean;
  isDifferential: boolean;
  parentDiagnosisId: string | null;
  diagnosedBy: string | null;
  diagnosedAt: string | null;
  clinicalFindings: string | null;
  supportingLabResultIds: string[] | null;
  supportingImagingIds: string[] | null;
  treatmentPlan: string | null;
  followUp: string | null;
  notes: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  confidence: string | null;
};

export type ChartEncounter = {
  id: string;
  status: string;
  appointmentId: string | null;
  patientId: string;
  patientName: string;
  mrn: string;
  doctorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  type: string;
  chiefComplaint: string | null;
  symptomOnset: string | null;
  symptomDurationValue: number | null;
  symptomDurationUnit: string | null;
  severity: string | null;
  symptoms: string[];
  physicalExamination: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  symptomsText: string | null;
  diagnosisText: string | null;
  labsText: string | null;
  imagingText: string | null;
  treatmentsText: string | null;
  temperature: number | null;
  pulse: number | null;
  respRate: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  spO2: number | null;
  height: number | null;
  weight: number | null;
  painLocation: string | null;
  symptomNature: string | null;
  aggravatingFactors: string | null;
  alleviatingFactors: string | null;
  history: unknown;
  examination: unknown;
  treatmentPlan: unknown;
  diagnoses: ChartDiagnosis[];
  orders: ChartOrder[];
};

const emptyForm = {
  type: "CONSULTATION",
  chiefComplaint: "",
  symptomOnset: "",
  symptomDurationValue: "",
  symptomDurationUnit: "",
  severity: "",
  symptoms: [] as string[],
  subjective: "",
  objective: "",
  physicalExamination: "",
  assessment: "",
  plan: "",
  symptomsText: "",
  diagnosisText: "",
  labsText: "",
  imagingText: "",
  treatmentsText: "",
  temperature: "",
  pulse: "",
  respRate: "",
  bpSystolic: "",
  bpDiastolic: "",
  spO2: "",
  height: "",
  weight: "",
};

const ORDER_STATUS_BADGE: Record<string, "secondary" | "default" | "success" | "destructive" | "info"> = {
  PENDING: "secondary",
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

const PRESCRIPTION_STATUS_BADGE: Record<string, "secondary" | "default" | "success" | "destructive" | "info" | "warning"> = {
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "destructive",
  ON_HOLD: "warning",
  EXPIRED: "secondary",
};

const DIAGNOSIS_STATUS_BADGE: Record<string, "secondary" | "default" | "success" | "destructive" | "info" | "warning"> = {
  SUSPECTED: "secondary",
  PROVISIONAL: "warning",
  CONFIRMED: "success",
  RULED_OUT: "destructive",
  RESOLVED: "default",
  CHRONIC: "info",
};

const toStr = (v: number | null) => (v == null ? "" : String(v));

export function EncounterChart({
  encounter,
  canWrite,
  canSign,
  canAmend,
  showSkeleton3D = false,
}: {
  encounter: ChartEncounter;
  canWrite: boolean;
  canSign: boolean;
  canAmend: boolean;
  showSkeleton3D?: boolean;
}) {
  const t = useTranslations("encounters");
  const tc = useTranslations("common");
  const ta = useTranslations("appointments");
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    ...emptyForm,
    type: encounter.type,
    chiefComplaint: encounter.chiefComplaint ?? "",
    symptomOnset: encounter.symptomOnset ?? "",
    symptomDurationValue: toStr(encounter.symptomDurationValue),
    symptomDurationUnit: encounter.symptomDurationUnit ?? "",
    severity: encounter.severity ?? "",
    symptoms: encounter.symptoms ?? [],
    subjective: encounter.subjective ?? "",
    objective: encounter.objective ?? "",
    physicalExamination: encounter.physicalExamination ?? "",
    assessment: encounter.assessment ?? "",
    plan: encounter.plan ?? "",
    symptomsText: encounter.symptomsText ?? "",
    diagnosisText: encounter.diagnosisText ?? "",
    labsText: encounter.labsText ?? "",
    imagingText: encounter.imagingText ?? "",
    treatmentsText: encounter.treatmentsText ?? "",
    temperature: toStr(encounter.temperature),
    pulse: toStr(encounter.pulse),
    respRate: toStr(encounter.respRate),
    bpSystolic: toStr(encounter.bpSystolic),
    bpDiastolic: toStr(encounter.bpDiastolic),
    spO2: toStr(encounter.spO2),
    height: toStr(encounter.height),
    weight: toStr(encounter.weight),
  });
  const [busy, setBusy] = useState(false);
  const editable = canWrite && encounter.status !== "COMPLETED" && encounter.status !== "SIGNED";

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    try {
      const res = await updateEncounter(encounter.id, form);
      if (res.ok) {
        toast.success(t("saved"));
        setEdit(false);
        router.refresh();
      } else {
        toast.error(t("savedFailed"));
      }
    } catch {
      toast.error(t("savedFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      const res = await saveEncounterDraft(encounter.id, form);
      if (res.ok) {
        toast.success(t("savedDraft"));
        router.refresh();
      } else {
        toast.error(t("savedFailed"));
      }
    } catch {
      toast.error(t("savedFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function complete() {
    const res = await encounterAction("complete", encounter.id);
    if (res.ok) {
      toast.success(t("visitCompleted"));
      router.push("/encounters");
    } else {
      toast.error(t("savedFailed"));
    }
  }

  async function sign() {
    setBusy(true);
    try {
      const res = await signEncounter(encounter.id);
      if (res.ok) {
        toast.success(t("signed"));
        router.refresh();
      } else {
        toast.error(t("savedFailed"));
      }
    } catch {
      toast.error(t("savedFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAmend() {
    const reason = prompt(t("amendReasonPrompt"));
    if (!reason) return;
    setBusy(true);
    try {
      const res = await amendEncounter(encounter.id, form, reason);
      if (res.ok) {
        toast.success(t("amended"));
        setEdit(false);
        router.refresh();
      } else {
        toast.error(t("savedFailed"));
      }
    } catch {
      toast.error(t("savedFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant={
            encounter.status === "COMPLETED" ? "success" :
            encounter.status === "SIGNED" ? "info" :
            encounter.status === "AMENDED" ? "warning" :
            "warning"
          }>
            {encounter.status === "COMPLETED" ? t("completed") :
             encounter.status === "SIGNED" ? t("signed") :
             encounter.status === "AMENDED" ? t("amended") :
             t("inProgress")}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {encounter.doctorName ?? "—"}
          </span>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {encounter.status === "IN_PROGRESS" || encounter.status === "DRAFT" ? (
              <>
                <Button variant="outline" size="sm" onClick={saveDraft} disabled={busy}>
                  <FilePenLine />
                  {t("saveDraft")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEdit((e) => !e)}>
                  {edit ? tc("cancel") : tc("edit")}
                </Button>
                <Button size="sm" variant="success" onClick={complete} disabled={busy}>
                  <CheckCircle2 />
                  {t("completeVisit")}
                </Button>
              </>
            ) : encounter.status === "COMPLETED" ? (
              <Button size="sm" variant="outline" onClick={() => setEdit(true)} disabled={busy}>
                <Pen />
                {t("amend")}
              </Button>
            ) : encounter.status === "SIGNED" && canAmend ? (
              <Button size="sm" variant="outline" onClick={handleAmend} disabled={busy}>
                <Pen />
                {t("amend")}
              </Button>
            ) : encounter.status === "AMENDED" && canAmend ? (
              <Button size="sm" variant="outline" onClick={handleAmend} disabled={busy}>
                <Pen />
                {t("amend")}
              </Button>
            ) : null}
            {canSign && (encounter.status === "COMPLETED" || encounter.status === "IN_PROGRESS") && (
              <Button size="sm" variant="success" onClick={sign} disabled={busy}>
                <CheckCircle2 />
                {t("signNote")}
              </Button>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          {(
            [
              ["symptomsText", "dxSymptoms"],
              ["diagnosisText", "dxDiagnosis"],
              ["labsText", "dxLabs"],
              ["imagingText", "dxImaging"],
              ["treatmentsText", "dxTreatments"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="flex flex-col gap-2">
              <Label>{t(label)}</Label>
              {editable ? (
                <Textarea rows={3} value={form[k]} onChange={set(k)} />
              ) : (
                <p className="whitespace-pre-wrap text-sm">
                  {form[k] ? form[k] : <span className="text-muted-foreground">—</span>}
                </p>
              )}
              {k === "diagnosisText" && editable && showSkeleton3D && (
                <SkeletonDiagnosis
                  encounterId={encounter.id}
                  existingNames={encounter.diagnoses.map((diagnosis) => diagnosis.name)}
                />
              )}
            </div>
          ))}
          {editable && (
            <div className="flex justify-end">
              <Button onClick={save} disabled={busy}>
                {t("save")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}