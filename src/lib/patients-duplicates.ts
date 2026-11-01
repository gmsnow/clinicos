import { prisma } from "@/lib/db";
import { PATIENT_SELECT } from "@/lib/patients-query";

export type DuplicateCandidate = {
  id: string;
  mrn: string;
  firstNameAr: string;
  secondNameAr: string | null;
  lastNameAr: string;
  phone: string | null;
  nationalId: string | null;
  status: string;
  reasons: string[];
  score: number;
};

export type DuplicateInput = {
  firstNameAr: string;
  secondNameAr?: string;
  lastNameAr: string;
  phone?: string;
  phone2?: string;
  nationalId?: string;
  birthDate?: string;
  gender?: string;
};

const norm = (v?: string | null) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");

function similar(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.85;
  const setA = new Set(a);
  let shared = 0;
  for (const ch of b) if (setA.has(ch)) shared += 1;
  return shared / Math.max(a.length, b.length);
}

/**
 * Finds records that look like the same person, scoped to one clinic so the
 * longitudinal record is never split across organisations. Returns ranked
 * candidates; anything scored >= DUPLICATE_THRESHOLD is a probable duplicate.
 */
export const DUPLICATE_THRESHOLD = 0.6;

export async function findDuplicateCandidates(
  clinicId: string,
  input: DuplicateInput,
  excludeId?: string,
): Promise<DuplicateCandidate[]> {
  const first = norm(input.firstNameAr);
  const last = norm(input.lastNameAr);
  const phone = digits(input.phone) || digits(input.phone2);
  const nationalId = norm(input.nationalId);

  if (!first && !last && !phone && !nationalId) return [];

  const rows = await prisma.patient.findMany({
    where: {
      clinicId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        ...(nationalId ? [{ nationalId: { equals: nationalId } }] : []),
        ...(phone ? [{ phone: { contains: phone } }, { phone2: { contains: phone } }] : []),
        ...(first && last
          ? [{ firstNameAr: { contains: first } }, { lastNameAr: { contains: last } }]
          : []),
      ],
    },
    select: PATIENT_SELECT,
    take: 50,
  });

  const candidates: DuplicateCandidate[] = [];

  for (const row of rows) {
    const reasons: string[] = [];
    let score = 0;

    if (nationalId && norm(row.nationalId) === nationalId) {
      score += 0.6;
      reasons.push("nationalId");
    }

    const rowPhone = digits(row.phone) || digits(row.phone2);
    if (phone && rowPhone && (phone === rowPhone || rowPhone.endsWith(phone))) {
      score += 0.3;
      reasons.push("phone");
    }

    const nameScore = Math.max(
      similar(first, norm(row.firstNameAr)),
      similar(last, norm(row.lastNameAr)),
    );
    if (nameScore >= 0.8) {
      score += 0.35;
      reasons.push("name");
    }

    if (input.birthDate && row.birthDate) {
      const a = input.birthDate.slice(0, 10);
      const b = row.birthDate.toISOString().slice(0, 10);
      if (a === b) {
        score += 0.2;
        reasons.push("birthDate");
      }
    }

    if (score <= 0) continue;
    candidates.push({
      id: row.id,
      mrn: row.mrn,
      firstNameAr: row.firstNameAr,
      secondNameAr: row.secondNameAr,
      lastNameAr: row.lastNameAr,
      phone: row.phone,
      nationalId: row.nationalId,
      status: row.status,
      reasons,
      score: Math.min(1, Number(score.toFixed(2))),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function probableDuplicates(candidates: DuplicateCandidate[]) {
  return candidates.filter((c) => c.score >= DUPLICATE_THRESHOLD);
}

export function reasonLabel(reason: string) {
  switch (reason) {
    case "nationalId":
      return "nationalId";
    case "phone":
      return "phone";
    case "name":
      return "name";
    case "birthDate":
      return "birthDate";
    default:
      return "name";
  }
}