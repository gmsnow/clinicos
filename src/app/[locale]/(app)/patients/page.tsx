import { Plus, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requirePermission } from "@/core/auth/session";
import { can } from "@/core/rbac";
import { prisma } from "@/lib/db";
import { PATIENT_SELECT, buildPatientWhere } from "@/lib/patients-query";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { PatientsToolbar } from "@/components/patients/patients-toolbar";
import { PatientsTable } from "@/components/patients/patients-table";
import { RecentlyViewed } from "@/components/patients/recently-viewed";

const PAGE_SIZE = 25;

type SearchParams = Record<string, string | undefined>;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission("patients:read");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("patients");
  const tc = await getTranslations("common");
  const canWrite = await can(user, "patients:write");

  const pageNum = Math.max(1, Number(params.page) || 1);
  const clinicId = user.currentClinicId ?? "";

  const where = buildPatientWhere(clinicId, {
    q: params.q,
    status: params.status,
    gender: params.gender,
    city: params.city,
    ageMin: params.ageMin ? Number(params.ageMin) : undefined,
    ageMax: params.ageMax ? Number(params.ageMax) : undefined,
    registeredFrom: params.registeredFrom,
    registeredTo: params.registeredTo,
  });

  const [patients, total, recent] = await Promise.all([
    prisma.patient.findMany({
      where,
      select: PATIENT_SELECT,
      orderBy: [{ createdAt: "desc" }],
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.patient.count({ where }),
    clinicId
      ? prisma.patientView.findMany({
          where: { clinicId, userId: user.id },
          orderBy: { viewedAt: "desc" },
          take: 8,
          select: {
            viewedAt: true,
            patient: { select: PATIENT_SELECT },
          },
        })
      : Promise.resolve([]),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const prevDisabled = pageNum <= 1;
  const nextDisabled = pageNum >= totalPages;

  function path(page?: number) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (!value || key === "page") continue;
      search.set(key, value);
    }
    if (page && page > 1) search.set("page", String(page));
    const qs = search.toString();
    return qs ? `/patients?${qs}` : "/patients";
  }

  const viewedItems = recent.map((r) => ({
    viewedAt: r.viewedAt.toISOString(),
    ...r.patient,
  }));

  return (
    <div>
      <PageHeader
        title={t("title")}
        icon={Users}
        actions={
          canWrite ? (
            <Button asChild>
              <Link href="/patients/new">
                <Plus />
                {t("newPatient")}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <PatientsToolbar />
          <p className="text-sm text-muted-foreground">
            {t("resultCount", { count: total })}
          </p>
        </div>

        <PatientsTable patients={patients} locale={locale} />

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-primary underline-offset-4 hover:underline">
              {tc("previous")}
            </span>
            <span className="text-sm text-muted-foreground">
              {pageNum} / {totalPages}
            </span>
            <span className="text-sm text-primary underline-offset-4 hover:underline">
              {tc("next")}
            </span>
          </div>
        )}

        <RecentlyViewed items={viewedItems} locale={locale} />

      </div>
    </div>
  );
}