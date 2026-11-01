import { Pencil, Printer, Stethoscope } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Patient } from "@/lib/generated/prisma/client";
import { calcAge, displayName, initials } from "@/lib/patient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OpenVisitButton } from "@/components/patients/profile/open-visit-button";
import { DeletePatientButton } from "@/components/patients/delete-patient-button";

export async function PatientIdentity({
  patient,
  locale,
  canWrite,
}: {
  patient: Patient;
  locale: string;
  canWrite: boolean;
}) {
  const t = await getTranslations("patients");
  const age = calcAge(patient.birthDate);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
              {initials(patient)}
            </span>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-xl font-semibold tracking-tight">
                {displayName(patient, locale)}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {patient.mrn}
                </span>
                <Badge variant={patient.status === "ACTIVE" ? "success" : "secondary"}>
                  {t(patient.status === "ACTIVE" ? "statusActive" : "statusInactive")}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {t("gender")}:{" "}
                  {t(patient.gender === "FEMALE" ? "female" : "male")}
                  {age !== null && ` · ${t("age")}: ${age}`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWrite && <OpenVisitButton patientId={patient.id} />}
            <Button asChild variant="outline" size="sm">
              <Link href={`/patients/${patient.id}/chart`}>
                <Stethoscope />
                {t("chart")}
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/patients/${patient.id}/form`} target="_blank" rel="noreferrer">
                <Printer />
                {t("printForm")}
              </Link>
            </Button>
            {canWrite && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/patients/${patient.id}/edit`}>
                  <Pencil />
                  {t("edit")}
                </Link>
              </Button>
            )}
            {canWrite && <DeletePatientButton patientId={patient.id} />}
          </div>
        </div>

      </CardContent>
    </Card>
  );
}