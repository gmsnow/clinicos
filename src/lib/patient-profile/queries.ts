import { prisma } from "@/lib/db";
import { toNumber } from "@/lib/format";
import type { ProfileTabId } from "./tabs";

export type ProfileCounts = Partial<Record<ProfileTabId | "appointments", number>>;

export function getProfileCounts(
  clinicId: string,
  patientId: string,
): Promise<ProfileCounts> {
  const scope = { clinicId, patientId };
  return Promise.all([
    prisma.medicalHistory.count({ where: scope }),
    prisma.encounterDiagnosis.count({
      where: { encounter: scope },
    }),
    prisma.allergy.count({ where: { ...scope, isActive: true } }),
    prisma.medicalOrder.count({
      where: { ...scope, kind: "MEDICATION", status: { in: ["PENDING", "ACTIVE"] } },
    }),
    prisma.medicalOrder.count({
      where: { ...scope, kind: "MEDICATION", status: { in: ["COMPLETED", "CANCELLED"] } },
    }),
    prisma.appointment.count({ where: scope }),
    prisma.labRequest.count({ where: scope }),
    prisma.imagingRequest.count({ where: scope }),
    prisma.procedure.count({ where: scope }),
    prisma.encounter.count({
      where: {
        ...scope,
        OR: [
          { subjective: { not: null } },
          { objective: { not: null } },
          { assessment: { not: null } },
          { plan: { not: null } },
        ],
      },
    }),
    prisma.encounter.count({
      where: {
        ...scope,
        OR: [
          { temperature: { not: null } },
          { pulse: { not: null } },
          { spO2: { not: null } },
          { weight: { not: null } },
        ],
      },
    }),
    prisma.patientDocument.count({ where: scope }),
    prisma.invoice.count({ where: scope }),
    prisma.appointment.count({ where: { ...scope, type: "FOLLOW_UP" } }),
    prisma.referral.count({ where: scope }),
    prisma.auditLog.count({ where: { entityId: patientId } }),
  ]).then(
    ([
      history,
      diagnoses,
      allergies,
      medications,
      prescriptions,
      appointments,
      lab,
      imaging,
      procedures,
      notes,
      vitals,
      documents,
      billing,
      followup,
      referrals,
      audit,
    ]) => ({
      history,
      diagnoses,
      allergies,
      medications,
      prescriptions,
      appointments,
      lab,
      imaging,
      procedures,
      notes,
      vitals,
      documents,
      billing,
      followup,
      referrals,
      audit,
    }),
  );
}

export function loadOverview(clinicId: string, patientId: string) {
  return Promise.all([
    prisma.encounter.findFirst({
      where: { clinicId, patientId, status: "COMPLETED" },
      include: { doctor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.appointment.findFirst({
      where: { clinicId, patientId, startTime: { gte: new Date() }, status: "SCHEDULED" },
      include: { doctor: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    }),
    prisma.allergy.findMany({
      where: { clinicId, patientId, isActive: true },
      orderBy: { severity: "desc" },
      take: 5,
      select: { id: true, allergen: true, severity: true },
    }),
    prisma.encounter.count({ where: { clinicId, patientId } }),
    prisma.invoice.aggregate({
      where: { clinicId, patientId, status: { in: ["OPEN", "PAID"] } },
      _sum: { total: true, paidAmount: true },
    }),
    prisma.encounter.findMany({
      where: { clinicId, patientId },
      select: {
        id: true,
        createdAt: true,
        chiefComplaint: true,
        status: true,
        doctor: { select: { name: true } },
        _count: { select: { diagnoses: true, orders: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]).then(([lastEncounter, nextAppointment, alerts, visitCount, billing, recent]) => ({
    lastEncounter,
    nextAppointment,
    alerts,
    visitCount,
    billing: {
      total: toNumber(billing._sum.total),
      paid: toNumber(billing._sum.paidAmount),
      balance: toNumber(billing._sum.total) - toNumber(billing._sum.paidAmount),
    },
    recent,
  }));
}

export function loadHistory(clinicId: string, patientId: string) {
  return prisma.medicalHistory.findMany({
    where: { clinicId, patientId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });
}

export function loadVisitSessions(clinicId: string, patientId: string) {
  return prisma.encounter.findMany({
    where: { clinicId, patientId },
    select: {
      id: true,
      createdAt: true,
      status: true,
      chiefComplaint: true,
      subjective: true,
      plan: true,
      doctor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function loadDiagnoses(clinicId: string, patientId: string) {
  const encounters = await prisma.encounter.findMany({
    where: { clinicId, patientId },
    select: {
      id: true,
      createdAt: true,
      diagnosisText: true,
      doctor: { select: { name: true } },
      diagnoses: {
        select: {
          id: true,
          code: true,
          name: true,
          description: true,
          classification: true,
          codeSystem: true,
          status: true,
          isPrimary: true,
          isDifferential: true,
          parentDiagnosisId: true,
          diagnosedBy: true,
          diagnosedAt: true,
          clinicalFindings: true,
          supportingLabResultIds: true,
          supportingImagingIds: true,
          treatmentPlan: true,
          followUp: true,
          notes: true,
          resolvedAt: true,
          resolvedBy: true,
          createdBy: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const items = encounters.flatMap((encounter) =>
    encounter.diagnoses.map((diagnosis) => ({
      ...diagnosis,
      encounterId: encounter.id,
      encounterDate: encounter.createdAt,
      doctor: encounter.doctor?.name ?? null,
    })),
  );

  const freeText = encounters
    .filter((e) => e.diagnosisText?.trim())
    .map((e) => ({
      id: `ft-${e.id}`,
      code: null,
      name: e.diagnosisText!.trim(),
      description: null,
      classification: "ICD10",
      codeSystem: null,
      status: "PROVISIONAL",
      isPrimary: true,
      isDifferential: false,
      parentDiagnosisId: null,
      diagnosedBy: null,
      diagnosedAt: null,
      clinicalFindings: null,
      supportingLabResultIds: [],
      supportingImagingIds: [],
      treatmentPlan: null,
      followUp: null,
      notes: null,
      resolvedAt: null,
      resolvedBy: null,
      createdBy: null,
      createdAt: e.createdAt,
      encounterId: e.id,
      encounterDate: e.createdAt,
      doctor: e.doctor?.name ?? null,
    }));

  return [...items, ...freeText].sort(
    (a, b) => new Date(b.encounterDate).getTime() - new Date(a.encounterDate).getTime(),
  );
}

export function loadAllergies(clinicId: string, patientId: string) {
  return prisma.allergy.findMany({
    where: { clinicId, patientId },
    orderBy: [{ isActive: "desc" }, { severity: "desc" }, { createdAt: "desc" }],
  });
}

export function loadEncounterTreatments(clinicId: string, patientId: string) {
  return prisma.encounter.findMany({
    where: {
      clinicId,
      patientId,
      treatmentsText: {
        not: null,
      },
    },
    select: {
      id: true,
      createdAt: true,
      treatmentsText: true,
      doctor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).then((rows) =>
    rows
      .filter((row) => row.treatmentsText && row.treatmentsText.trim().length > 0)
      .map((row) => ({
        id: `treat-${row.id}`,
        kind: "MEDICATION" as const,
        name: row.treatmentsText!.trim().split(/\n+/)[0]!.slice(0, 160) || "العلاجات المطلوبة",
        genericName: null,
        brandName: null,
        strength: null,
        dosageForm: null,
        route: null,
        dose: null,
        doseUnit: null,
        dosage: null,
        frequency: null,
        frequencyCode: null,
        durationDays: null,
        quantity: null,
        unit: null,
        refills: null,
        clinicalIndication: null,
        instructions: row.treatmentsText,
        status: "COMPLETED",
        prescriptionStatus: "COMPLETED",
        dispensedAt: null,
        drugCatalogId: null,
        encounter: {
          id: row.id,
          createdAt: row.createdAt,
          doctor: row.doctor,
        },
        dispensations: [],
      })),
  );
}

const MEDICATION_INCLUDE = {
  encounter: {
    select: { id: true, createdAt: true, doctor: { select: { name: true } } },
  },
  dispensations: {
    select: {
      id: true,
      dispensedAt: true,
      quantityDispensed: true,
      unit: true,
    },
  },
};

export function loadCurrentMedications(clinicId: string, patientId: string) {
  return prisma.medicalOrder.findMany({
    where: {
      clinicId,
      patientId,
      kind: "MEDICATION",
      status: { in: ["PENDING", "ACTIVE"] },
    },
    include: MEDICATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export function loadPreviousPrescriptions(clinicId: string, patientId: string) {
  return prisma.medicalOrder.findMany({
    where: {
      clinicId,
      patientId,
      kind: "MEDICATION",
      status: { in: ["COMPLETED", "CANCELLED"] },
    },
    include: MEDICATION_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

const APPOINTMENT_INCLUDE = {
  doctor: { select: { name: true } },
  department: { select: { nameAr: true, nameEn: true } },
};

export function loadAppointments(clinicId: string, patientId: string) {
  return prisma.appointment.findMany({
    where: { clinicId, patientId },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startTime: "desc" },
    take: 150,
  });
}

export function loadFollowUps(clinicId: string, patientId: string) {
  return prisma.appointment.findMany({
    where: { clinicId, patientId, type: "FOLLOW_UP" },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startTime: "desc" },
    take: 150,
  });
}

export function loadFollowUpVisits(clinicId: string, patientId: string) {
  return prisma.visit.findMany({
    where: {
      clinicId,
      patientId,
      OR: [{ type: "FOLLOW_UP" }, { reason: { contains: "عوده", mode: "insensitive" } }, { reason: { contains: "عودة", mode: "insensitive" } }],
    },
    include: {
      doctor: { select: { name: true } },
      queueEntries: { select: { status: true } },
    },
    orderBy: { arrivedAt: "desc" },
    take: 150,
  });
}

export function loadLabResults(clinicId: string, patientId: string) {
  return prisma.labRequest.findMany({
    where: { clinicId, patientId },
    include: {
      tests: {
        select: {
          id: true,
          testName: true,
          resultValue: true,
          unit: true,
          referenceRange: true,
          isAbnormal: true,
          status: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function loadImaging(clinicId: string, patientId: string) {
  return prisma.imagingRequest.findMany({
    where: { clinicId, patientId },
    include: { order: { select: { id: true, name: true, instructions: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function loadProcedures(clinicId: string, patientId: string) {
  return prisma.procedure.findMany({
    where: { clinicId, patientId },
    orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }],
  });
}

const NOTE_FIELDS = {
  subjective: true,
  objective: true,
  assessment: true,
  plan: true,
  chiefComplaint: true,
};

export function loadClinicalNotes(clinicId: string, patientId: string) {
  return prisma.encounter.findMany({
    where: {
      clinicId,
      patientId,
      OR: [
        { subjective: { not: null } },
        { objective: { not: null } },
        { assessment: { not: null } },
        { plan: { not: null } },
      ],
    },
    select: {
      id: true,
      createdAt: true,
      status: true,
      doctor: { select: { name: true } },
      ...NOTE_FIELDS,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function loadVitals(clinicId: string, patientId: string) {
  const [encounters, vitalSigns] = await Promise.all([
    prisma.encounter.findMany({
      where: {
        clinicId,
        patientId,
        OR: [
          { temperature: { not: null } },
          { pulse: { not: null } },
          { respRate: { not: null } },
          { spO2: { not: null } },
          { height: { not: null } },
          { weight: { not: null } },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        doctor: { select: { name: true } },
        temperature: true,
        pulse: true,
        respRate: true,
        bpSystolic: true,
        bpDiastolic: true,
        spO2: true,
        height: true,
        weight: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.vitalSign.findMany({
      where: { clinicId, patientId },
      select: {
        id: true,
        recordedAt: true,
        recordedBy: true,
        temperature: true,
        pulse: true,
        respRate: true,
        bpSystolic: true,
        bpDiastolic: true,
        spO2: true,
        height: true,
        weight: true,
        painScore: true,
        consciousness: true,
        glucose: true,
        glucoseType: true,
        glucoseTiming: true,
        position: true,
        notes: true,
      },
      orderBy: { recordedAt: "desc" },
      take: 100,
    }),
  ]);

  const userIds = [...new Set(vitalSigns.map((v) => v.recordedBy))];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const encounterItems = encounters.map((row) => {
    const heightCm = toNumber(row.height);
    const weightKg = toNumber(row.weight);
    return {
      id: `e-${row.id}`,
      createdAt: row.createdAt,
      source: "encounter",
      doctor: row.doctor,
      temperature: row.temperature === null ? null : toNumber(row.temperature),
      pulse: row.pulse,
      respRate: row.respRate,
      bpSystolic: row.bpSystolic,
      bpDiastolic: row.bpDiastolic,
      spO2: row.spO2,
      heightCm: heightCm || null,
      weightKg: weightKg || null,
      bmi:
        heightCm > 0 && weightKg > 0
          ? Math.round((weightKg / (heightCm * heightCm / 10000)) * 10) / 10
          : null,
      painScore: null,
      consciousness: null,
      glucose: null,
      glucoseType: null,
      glucoseTiming: null,
      position: null,
      notes: null,
    };
  });

  const vitalsItems = vitalSigns.map((v) => {
    const heightCm = toNumber(v.height);
    const weightKg = toNumber(v.weight);
    return {
      id: `v-${v.id}`,
      createdAt: v.recordedAt,
      source: "nursing",
      doctor: nameById.get(v.recordedBy)
        ? { name: nameById.get(v.recordedBy)! }
        : null,
      temperature: v.temperature === null ? null : toNumber(v.temperature),
      pulse: v.pulse,
      respRate: v.respRate,
      bpSystolic: v.bpSystolic,
      bpDiastolic: v.bpDiastolic,
      spO2: v.spO2,
      heightCm: heightCm || null,
      weightKg: weightKg || null,
      bmi:
        heightCm > 0 && weightKg > 0
          ? Math.round((weightKg / (heightCm * heightCm / 10000)) * 10) / 10
          : null,
      painScore: v.painScore,
      consciousness: v.consciousness,
      glucose: v.glucose === null ? null : toNumber(v.glucose),
      glucoseType: v.glucoseType,
      glucoseTiming: v.glucoseTiming,
      position: v.position,
      notes: v.notes,
    };
  });

  return [...encounterItems, ...vitalsItems]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 100);
}

export function loadDocuments(clinicId: string, patientId: string) {
  return prisma.patientDocument.findMany({
    where: { clinicId, patientId },
    orderBy: { createdAt: "desc" },
  });
}

export function loadInvoices(clinicId: string, patientId: string) {
  return prisma.invoice.findMany({
    where: { clinicId, patientId },
    include: {
      payments: {
        select: {
          id: true,
          method: true,
          amount: true,
          reference: true,
          paidAt: true,
        },
        orderBy: { paidAt: "desc" },
      },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function loadReferrals(clinicId: string, patientId: string) {
  return prisma.referral.findMany({
    where: { clinicId, patientId },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
  });
}

export function loadPatientAudit(clinicId: string, patientId: string) {
  return prisma.auditLog.findMany({
    where: { entityId: patientId },
    include: { actor: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
}

export function loadEncounterImagingText(clinicId: string, patientId: string) {
  return prisma.encounter.findMany({
    where: {
      clinicId,
      patientId,
      imagingText: {
        not: null,
      },
    },
    select: {
      id: true,
      createdAt: true,
      imagingText: true,
      doctor: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  }).then((rows) =>
    rows
      .filter((row) => row.imagingText && row.imagingText.trim().length > 0)
      .map((row) => ({
        id: `img-txt-${row.id}`,
        orderId: null,
        patientId,
        modality: row.imagingText!.trim().split(/\n+/)[0]!.slice(0, 80) || null,
        status: "REPORTED",
        findings: row.imagingText,
        impression: null,
        requestedBy: null,
        reportedBy: row.doctor?.name ?? null,
        reportedAt: row.createdAt,
        studyInstanceUID: null,
        seriesInstanceUID: null,
        sopInstanceUID: null,
        pacsStatus: null,
        pacsSentAt: null,
        createdAt: row.createdAt,
        updatedAt: row.createdAt,
        order: null,
        encounterId: row.id,
      })),
  );
}

