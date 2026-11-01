"use server";

import { headers } from "next/headers";
import { requirePermission } from "@/core/auth/session";
import { recordAudit } from "@/core/audit";
import { prisma } from "@/lib/db";
import {
  findDuplicateCandidates,
  probableDuplicates,
  type DuplicateCandidate,
} from "@/lib/patients-duplicates";

export type DuplicateCheckResult = {
  ok: true;
  candidates: DuplicateCandidate[];
  probable: DuplicateCandidate[];
  blocked: boolean;
};

/**
 * Live duplicate check used while registering. Scoped to the caller's clinic so
 * a patient keeps one longitudinal record per organisation.
 */
export async function checkDuplicatePatient(
  input: {
    firstNameAr?: string;
    secondNameAr?: string;
    lastNameAr?: string;
    phone?: string;
    phone2?: string;
    nationalId?: string;
    birthDate?: string;
  },
  excludeId?: string,
): Promise<DuplicateCheckResult> {
  const user = await requirePermission("patients:read");
  const clinicId = user.currentClinicId ?? "";
  if (!clinicId) return { ok: true, candidates: [], probable: [], blocked: false };

  if (!input.firstNameAr?.trim() && !input.nationalId?.trim() && !input.phone?.trim()) {
    return { ok: true, candidates: [], probable: [], blocked: false };
  }

  const candidates = await findDuplicateCandidates(
    clinicId,
    {
      firstNameAr: input.firstNameAr ?? "",
      secondNameAr: input.secondNameAr,
      lastNameAr: input.lastNameAr ?? "",
      phone: input.phone,
      phone2: input.phone2,
      nationalId: input.nationalId,
      birthDate: input.birthDate,
    },
    excludeId,
  );

  const probable = probableDuplicates(candidates);
  return {
    ok: true,
    candidates,
    probable,
    // A national-ID clash is always blocking; softer matches need confirmation.
    blocked: probable.some((c) => c.reasons.includes("nationalId")),
  };
}

export async function recordPatientView(patientId: string) {
  const user = await requirePermission("patients:read");
  const clinicId = user.currentClinicId;
  if (!clinicId) return;

  const owned = await prisma.patient.findFirst({
    where: { id: patientId, clinicId },
    select: { id: true },
  });
  if (!owned) return;

  await prisma.patientView.upsert({
    where: { userId_patientId: { userId: user.id, patientId } },
    create: { clinicId, userId: user.id, patientId },
    update: { viewedAt: new Date() },
  });
}

/** Lightweight audit breadcrumb for read access on clinical records. */
export async function auditPatientAccess(patientId: string, action: "read") {
  const h = await headers();
  const user = await requirePermission("patients:read");
  const clinicId = user.currentClinicId ?? null;
  recordAudit({
    actorId: user.id,
    action,
    entity: "Patient",
    entityId: patientId,
    clinicId,
    metadata: { path: h.get("x-invoke-path") ?? null },
  });
}