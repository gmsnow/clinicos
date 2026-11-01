import type { Prisma } from "@/lib/generated/prisma/client";

export type PatientFilters = {
  q?: string;
  status?: string;
  gender?: string;
  city?: string;
  ageMin?: number;
  ageMax?: number;
  registeredFrom?: string;
  registeredTo?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(value?: string | number): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Splits a free-text query so a multi-token query ("محمد احمد") matches on
 * first name AND last name instead of a single substring match.
 */
export function searchTokens(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 4);
}

/** Free-text search across MRN, national ID, all name parts and both phones. */
export function textSearch(q: string | undefined): Prisma.PatientWhereInput[] {
  const tokens = searchTokens(q ?? "");
  if (tokens.length === 0) return [];

  return tokens.flatMap((token): Prisma.PatientWhereInput[] => [
    { mrn: { contains: token, mode: "insensitive" } },
    { nationalId: { contains: token, mode: "insensitive" } },
    { phone: { contains: token, mode: "insensitive" } },
    { phone2: { contains: token, mode: "insensitive" } },
    { firstNameAr: { contains: token } },
    { secondNameAr: { contains: token } },
    { lastNameAr: { contains: token } },
    { firstNameEn: { contains: token, mode: "insensitive" } },
    { lastNameEn: { contains: token, mode: "insensitive" } },
  ]);
}

/**
 * Single source of truth for patient filtering. Every patient surface (list,
 * live search API, duplicates) goes through this so a patient can never be
 * hidden from the search that guards duplicate registration.
 */
export function buildPatientWhere(
  clinicId: string,
  filters: PatientFilters,
): Prisma.PatientWhereInput {
  const and: Prisma.PatientWhereInput[] = [];

  const text = textSearch(filters.q);
  if (text.length > 0) {
    and.push({ OR: text });
  }

  const status =
    filters.status === "inactive"
      ? "INACTIVE"
      : filters.status === "all"
        ? undefined
        : "ACTIVE";
  if (status) and.push({ status });

  if (filters.gender === "male" || filters.gender === "female") {
    and.push({ gender: filters.gender === "male" ? "MALE" : "FEMALE" });
  }

  if (filters.city) and.push({ city: filters.city as never });

  const min = num(filters.ageMin);
  const max = num(filters.ageMax);
  if (min !== undefined || max !== undefined) {
    and.push(birthDateWindow(min, max));
  }

  if (filters.registeredFrom && DATE_RE.test(filters.registeredFrom)) {
    and.push({
      createdAt: { gte: new Date(`${filters.registeredFrom}T00:00:00.000Z`) },
    });
  }
  if (filters.registeredTo && DATE_RE.test(filters.registeredTo)) {
    and.push({
      createdAt: { lte: new Date(`${filters.registeredTo}T23:59:59.999Z`) },
    });
  }

  return {
    clinicId,
    AND: and,
  };
}

function birthDateWindow(min?: number, max?: number): Prisma.PatientWhereInput {
  const now = new Date();
  const oldestAge = Math.max(min ?? 0, max ?? 0);
  const youngestAge = Math.min(min ?? max ?? 0, max ?? min ?? 0);
  const year = now.getUTCFullYear();
  return {
    birthDate: {
      lte: new Date(Date.UTC(year - youngestAge, 11, 31, 23, 59, 59, 999)),
      gte: new Date(Date.UTC(year - oldestAge - 1, 0, 1)),
    },
  };
}

export const PATIENT_SELECT = {
  id: true,
  mrn: true,
  firstNameAr: true,
  secondNameAr: true,
  lastNameAr: true,
  firstNameEn: true,
  lastNameEn: true,
  gender: true,
  birthDate: true,
  phone: true,
  phone2: true,
  nationalId: true,
  city: true,
  status: true,
  createdAt: true,
} satisfies Prisma.PatientSelect;