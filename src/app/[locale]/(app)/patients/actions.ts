"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { requirePermission } from "@/core/auth/session";
import { recordAudit } from "@/core/audit";
import { prisma } from "@/lib/db";
import {
  findDuplicateCandidates,
  probableDuplicates,
  type DuplicateCandidate,
} from "@/lib/patients-duplicates";
import { enqueuePatient } from "@/lib/visits/queue";
import { patientFormSchema, type PatientFormValues } from "./schema";

type ActionError =
  | "no-clinic"
  | "not-found"
  | "invalid"
  | "duplicate-national-id"
  | "duplicate-mrn"
  | "possible-duplicate";

type ActionResult =
  | { ok: true; id: string; mrn?: string; isNew?: boolean }
  | { ok: false; error: ActionError; candidates?: DuplicateCandidate[] };

export type SavePatientOptions = {
  /** Set once the user has reviewed duplicate candidates and wants to proceed. */
  confirmDuplicate?: boolean;
  /**
   * Whether registration should place the patient in the live queue. Defaults
   * to true; the "save and open visit" flow passes false because the visit
   * dialog already enqueues the patient.
   */
  enqueue?: boolean;
};

export type DeletePatientResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: "no-clinic" | "not-found" | "has-history" | "has-merges";
      counts?: { encounters: number; visits: number; invoices: number };
    };

async function nextMrn(
  clinicId: string,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const seq = await tx.numberSequence.upsert({
    where: { clinicId_key: { clinicId, key: "PATIENT" } },
    create: {
      clinicId,
      key: "PATIENT",
      prefix: "P",
      currentValue: 1n,
      padLength: 5,
    },
    update: { currentValue: { increment: 1 } },
  });
  const padded = String(seq.currentValue).padStart(
    seq.padLength > 0 ? seq.padLength : 5,
    "0",
  );
  return `${seq.prefix ?? ""}${padded}${seq.suffix ?? ""}`;
}

function toData(values: PatientFormValues) {
  return {
    firstNameAr: values.firstNameAr,
    secondNameAr: values.secondNameAr || null,
    lastNameAr: values.lastNameAr,
    gender: values.gender,
    birthDate: values.birthDate ? new Date(values.birthDate) : null,
    phone: values.phone || null,
    phone2: values.phone2 || null,
    nationalId: values.nationalId || null,
    price: new Prisma.Decimal(values.price),
    paymentMethod: values.paymentMethod,
    walletProvider: values.paymentMethod === "WALLET" ? values.walletProvider ?? null : null,
    walletTxnRef: values.paymentMethod === "WALLET" ? values.walletTxnRef || null : null,
    city: values.city ?? null,
    notes: values.notes || null,
  };
}

async function findDuplicateNationalId(
  clinicId: string,
  nationalId: string | undefined,
  excludeId?: string,
) {
  if (!nationalId) return null;
  return prisma.patient.findFirst({
    where: {
      clinicId,
      nationalId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, mrn: true },
  });
}

/**
 * Guards the longitudinal record: returns probable duplicates that already
 * exist in this clinic so the caller cannot silently create a parallel record.
 */
async function duplicateGuard(
  clinicId: string,
  values: PatientFormValues,
  options: SavePatientOptions | undefined,
  excludeId?: string,
): Promise<DuplicateCandidate[] | null> {
  const candidates = await findDuplicateCandidates(
    clinicId,
    {
      firstNameAr: values.firstNameAr,
      secondNameAr: values.secondNameAr,
      lastNameAr: values.lastNameAr,
      phone: values.phone,
      phone2: values.phone2,
      nationalId: values.nationalId,
      birthDate: values.birthDate,
      gender: values.gender,
    },
    excludeId,
  );

  const probable = probableDuplicates(candidates);
  if (probable.length === 0) return null;
  if (options?.confirmDuplicate) return null;
  return probable;
}

function uniqueViolation(error: unknown): ActionError | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (error.code !== "P2002") return null;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  if (fields.includes("nationalId")) return "duplicate-national-id";
  if (fields.includes("mrn")) return "duplicate-mrn";
  return "invalid";
}

async function resolveClinicId(user: { id: string; currentClinicId?: string | null }): Promise<string | null> {
  if (user.currentClinicId) return user.currentClinicId;
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clinicId: true, currentClinicId: true },
    });
    return dbUser?.currentClinicId ?? dbUser?.clinicId ?? null;
  } catch (err) {
    console.error("[patients] clinic resolve failed:", err);
    return null;
  }
}

export async function createPatient(
  values: PatientFormValues,
  options?: SavePatientOptions,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("patients:write");
    const parsed = patientFormSchema.parse(values);
    const clinicId = await resolveClinicId(user);
    if (!clinicId) return { ok: false, error: "no-clinic" };

    // Check if a patient with this national ID already exists in the clinic.
    // Only meaningful when a national ID was actually provided — an empty
    // value must not match arbitrary patients.
    const nationalId = parsed.nationalId?.trim();
    if (nationalId) {
      const existingPatient = await prisma.patient.findFirst({
        where: { clinicId, nationalId },
        select: { id: true },
      });
      if (existingPatient) {
        return { ok: true, id: existingPatient.id, isNew: false };
      }
    }

    if (await findDuplicateNationalId(clinicId, parsed.nationalId)) {
      const candidates = await findDuplicateCandidates(clinicId, {
        firstNameAr: parsed.firstNameAr,
        lastNameAr: parsed.lastNameAr,
        phone: parsed.phone,
        phone2: parsed.phone2,
        nationalId: parsed.nationalId,
      });
      return {
        ok: false,
        error: "duplicate-national-id",
        candidates: candidates.length ? candidates : undefined,
      };
    }

    const duplicates = await duplicateGuard(clinicId, parsed, options);
    if (duplicates) {
      return { ok: false, error: "possible-duplicate", candidates: duplicates };
    }

    const patient = await prisma.$transaction(async (tx) => {
      const mrn = await nextMrn(clinicId, tx);
      const created = await tx.patient.create({
        data: {
          clinicId,
          mrn,
          ...toData(parsed),
          createdBy: user.id,
          updatedBy: user.id,
        },
        select: { id: true },
      });
      if (options?.enqueue !== false) {
        await enqueuePatient(tx, {
          clinicId,
          patientId: created.id,
          mrn,
          userId: user.id,
        });
      }
      return { id: created.id, mrn };
    });

    recordAudit({
      actorId: user.id,
      action: "create",
      entity: "Patient",
      entityId: patient.id,
      clinicId,
      metadata: { mrn: patient.mrn, enqueued: options?.enqueue !== false },
    });
    revalidatePath("/patients");
    revalidatePath("/queue");
    revalidatePath("/reception");
    revalidatePath("/");
    return { ok: true, id: patient.id, mrn: patient.mrn };
  } catch (err) {
    const conflict = uniqueViolation(err);
    if (conflict) return { ok: false, error: conflict };
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, error: "invalid" };
    }
    throw err;
  }
}

export async function updatePatient(
  id: string,
  values: PatientFormValues,
  options?: SavePatientOptions,
): Promise<ActionResult> {
  try {
    const user = await requirePermission("patients:write");
    const parsed = patientFormSchema.parse(values);
    const clinicId = await resolveClinicId(user);
    if (!clinicId) return { ok: false, error: "no-clinic" };

    const existing = await prisma.patient.findFirst({ where: { id, clinicId } });
    if (!existing) return { ok: false, error: "not-found" };

    if (await findDuplicateNationalId(clinicId, parsed.nationalId, id)) {
      const candidates = await findDuplicateCandidates(
        clinicId,
        {
          firstNameAr: parsed.firstNameAr,
          lastNameAr: parsed.lastNameAr,
          phone: parsed.phone,
          phone2: parsed.phone2,
          nationalId: parsed.nationalId,
        },
        id,
      );
      return {
        ok: false,
        error: "duplicate-national-id",
        candidates: candidates.length ? candidates : undefined,
      };
    }

    const duplicates = await duplicateGuard(clinicId, parsed, options, id);
    if (duplicates) {
      return { ok: false, error: "possible-duplicate", candidates: duplicates };
    }

    await prisma.patient.update({
      where: { id },
      data: { ...toData(parsed), updatedBy: user.id },
    });

    recordAudit({
      actorId: user.id,
      action: "update",
      entity: "Patient",
      entityId: id,
      clinicId,
      metadata: { mrn: existing.mrn },
    });
    revalidatePath("/patients");
    revalidatePath(`/patients/${id}`);
    return { ok: true, id };
  } catch (err) {
    const conflict = uniqueViolation(err);
    if (conflict) return { ok: false, error: conflict };
    throw err;
  }
}

export async function deletePatient(
  id: string,
  options?: { force?: boolean },
): Promise<DeletePatientResult> {
  try {
    const user = await requirePermission("patients:write");
    const clinicId = await resolveClinicId(user);
    if (!clinicId) return { ok: false, error: "no-clinic" };

    const patient = await prisma.patient.findFirst({
      where: { id, clinicId },
      select: { id: true, mrn: true, status: true },
    });
    if (!patient) return { ok: false, error: "not-found" };

    if (patient.status === "INACTIVE" && !options?.force) {
      const [encounters, visits, invoices] = await Promise.all([
        prisma.encounter.count({ where: { patientId: id, clinicId } }),
        prisma.visit.count({ where: { patientId: id, clinicId } }),
        prisma.invoice.count({ where: { patientId: id, clinicId } }),
      ]);
      if (encounters + visits + invoices > 0) {
        return {
          ok: false,
          error: "has-history",
          counts: { encounters, visits, invoices },
        };
      }
    }

    const pendingMerges = await prisma.patientMergeRequest.count({
      where: { clinicId, primaryId: id, status: "PENDING" },
    });
    if (pendingMerges > 0 && !options?.force) {
      return { ok: false, error: "has-merges" };
    }

    await prisma.patient.delete({ where: { id } });

    recordAudit({
      actorId: user.id,
      action: "delete",
      entity: "Patient",
      entityId: id,
      clinicId,
      metadata: { mrn: patient.mrn, force: Boolean(options?.force) },
    });
    revalidatePath("/patients");
    revalidatePath(`/patients/${id}`);
    revalidatePath("/");
    return { ok: true, id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, error: "not-found" };
    }
    throw err;
  }
}