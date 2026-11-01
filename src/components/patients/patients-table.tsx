import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { displayName, initials } from "@/lib/patient";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Patient as PatientRow } from "@/lib/generated/prisma/client";

type Patient = Pick<
  PatientRow,
  | "id"
  | "mrn"
  | "firstNameAr"
  | "secondNameAr"
  | "lastNameAr"
  | "firstNameEn"
  | "lastNameEn"
  | "gender"
  | "birthDate"
  | "phone"
  | "nationalId"
  | "city"
  | "status"
  | "createdAt"
>;

export async function PatientsTable({
  patients,
  locale,
}: {
  patients: Patient[];
  locale: string;
}) {
  const t = await getTranslations("patients");

  if (patients.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
        {t("noResults")}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("mrn")}</TableHead>
              <TableHead>{t("fullName")}</TableHead>
              <TableHead>{t("nationalId")}</TableHead>
              <TableHead>{t("city")}</TableHead>
              <TableHead>{t("phone")}</TableHead>
              <TableHead>{t("registeredAt")}</TableHead>
              <TableHead>{t("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((p) => (
              <TableRow key={p.id} className="group">
                <TableCell>
                  <Link
                    href={`/patients/${p.id}`}
                    className="font-mono text-xs font-medium text-primary group-hover:underline"
                  >
                    {p.mrn}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link href={`/patients/${p.id}`} className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(p)}
                    </span>
                    <span className="font-medium">{displayName(p, locale)}</span>
                  </Link>
                </TableCell>
                <TableCell dir="ltr" className="text-start font-mono text-xs">
                  {p.nationalId || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {p.city ? (
                    t(`city_${p.city}`)
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell dir="ltr" className="text-start">
                  {p.phone || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {p.createdAt.toISOString().slice(0, 10)}
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === "ACTIVE" ? "success" : "secondary"}>
                    {t(p.status === "ACTIVE" ? "statusActive" : "statusInactive")}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}