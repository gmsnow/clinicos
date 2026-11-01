import "dotenv/config";
import { prisma } from "../src/lib/db";
import type { NotificationCategory } from "../src/lib/generated/prisma/client";

type TemplateSeed = {
  category: NotificationCategory;
  nameAr: string;
  nameEn: string;
  subjectAr: string;
  subjectEn: string;
  bodyAr: string;
  bodyEn: string;
  variables: string[];
};

const TEMPLATES: TemplateSeed[] = [
  {
    category: "APPOINTMENT_CONFIRMATION",
    nameAr: "تأكيد الموعد",
    nameEn: "Appointment confirmation",
    subjectAr: "تأكيد موعدك في {{clinicName}}",
    subjectEn: "Your appointment at {{clinicName}}",
    bodyAr:
      "عزيزي {{patientName}}،\n\nتم تأكيد موعدك في {{clinicName}}.\nالتاريخ: {{appointmentDate}}\nالوقت: {{appointmentTime}}\nالطبيب: {{doctorName}}\n\nمع التحية،\n{{clinicName}}",
    bodyEn:
      "Dear {{patientName}},\n\nYour appointment at {{clinicName}} is confirmed.\nDate: {{appointmentDate}}\nTime: {{appointmentTime}}\nDoctor: {{doctorName}}\n\nBest regards,\n{{clinicName}}",
    variables: ["patientName", "clinicName", "appointmentDate", "appointmentTime", "doctorName"],
  },
  {
    category: "APPOINTMENT_REMINDER",
    nameAr: "تذكير بالموعد",
    nameEn: "Appointment reminder",
    subjectAr: "تذكير بموعدك في {{clinicName}}",
    subjectEn: "Reminder: your appointment at {{clinicName}}",
    bodyAr:
      "عزيزي {{patientName}}،\n\nنذكّرك بموعدك في {{clinicName}} بتاريخ {{appointmentDate}} الساعة {{appointmentTime}}.\n\nمع التحية،\n{{clinicName}}",
    bodyEn:
      "Dear {{patientName}},\n\nThis is a reminder of your appointment at {{clinicName}} on {{appointmentDate}} at {{appointmentTime}}.\n\nBest regards,\n{{clinicName}}",
    variables: ["patientName", "clinicName", "appointmentDate", "appointmentTime"],
  },
  {
    category: "APPOINTMENT_CHANGE",
    nameAr: "تغيير الموعد",
    nameEn: "Appointment change",
    subjectAr: "تغيير في موعدك في {{clinicName}}",
    subjectEn: "Change to your appointment at {{clinicName}}",
    bodyAr:
      "عزيزي {{patientName}}،\n\nتم تغيير موعدك في {{clinicName}} إلى {{appointmentDate}} الساعة {{appointmentTime}}.\n\nمع التحية،\n{{clinicName}}",
    bodyEn:
      "Dear {{patientName}},\n\nYour appointment at {{clinicName}} has been changed to {{appointmentDate}} at {{appointmentTime}}.\n\nBest regards,\n{{clinicName}}",
    variables: ["patientName", "clinicName", "appointmentDate", "appointmentTime"],
  },
  {
    category: "PAYMENT_RECEIPT",
    nameAr: "إيصال دفع",
    nameEn: "Payment receipt",
    subjectAr: "إيصال دفع من {{clinicName}}",
    subjectEn: "Payment receipt from {{clinicName}}",
    bodyAr:
      "عزيزي {{patientName}}،\n\nتم استلام مبلغ {{amount}} {{currency}}.\nرقم الإيصال: {{receiptNumber}}\n\nمع التحية،\n{{clinicName}}",
    bodyEn:
      "Dear {{patientName}},\n\nWe received your payment of {{amount}} {{currency}}.\nReceipt number: {{receiptNumber}}\n\nBest regards,\n{{clinicName}}",
    variables: ["patientName", "clinicName", "amount", "currency", "receiptNumber"],
  },
  {
    category: "STAFF_TASK",
    nameAr: "مهمة موظف",
    nameEn: "Staff task",
    subjectAr: "مهمة جديدة: {{taskTitle}}",
    subjectEn: "New task: {{taskTitle}}",
    bodyAr:
      "لديك مهمة جديدة:\n{{taskDescription}}\nالأولوية: {{priority}}\nتاريخ الاستحقاق: {{dueDate}}",
    bodyEn:
      "You have a new task:\n{{taskDescription}}\nPriority: {{priority}}\nDue date: {{dueDate}}",
    variables: ["taskTitle", "taskDescription", "priority", "dueDate"],
  },
  {
    category: "CLINIC_ANNOUNCEMENT",
    nameAr: "إعلان العيادة",
    nameEn: "Clinic announcement",
    subjectAr: "إعلان من {{clinicName}}",
    subjectEn: "Announcement from {{clinicName}}",
    bodyAr: "{{announcementBody}}\n\nمع التحية،\n{{clinicName}}",
    bodyEn: "{{announcementBody}}\n\nBest regards,\n{{clinicName}}",
    variables: ["announcementBody", "clinicName"],
  },
];

async function seed() {
  const clinics = await prisma.clinic.findMany({ select: { id: true, nameAr: true } });
  console.log(`Seeding notification templates for ${clinics.length} clinic(s)...`);

  for (const clinic of clinics) {
    for (const t of TEMPLATES) {
      await prisma.notificationTemplate.upsert({
        where: {
          clinicId_category_channel: {
            clinicId: clinic.id,
            category: t.category,
            channel: "IN_APP",
          },
        },
        create: {
          clinicId: clinic.id,
          category: t.category,
          channel: "IN_APP",
          name: t.nameEn,
          nameAr: t.nameAr,
          nameEn: t.nameEn,
          subject: t.subjectEn,
          subjectAr: t.subjectAr,
          subjectEn: t.subjectEn,
          body: t.bodyEn,
          bodyAr: t.bodyAr,
          bodyEn: t.bodyEn,
          variables: t.variables,
          isSystem: true,
          isActive: true,
        },
        update: {
          nameAr: t.nameAr,
          nameEn: t.nameEn,
          subjectAr: t.subjectAr,
          subjectEn: t.subjectEn,
          bodyAr: t.bodyAr,
          bodyEn: t.bodyEn,
          variables: t.variables,
          isActive: true,
        },
      });
    }
    console.log(`  ${clinic.nameAr}: ${TEMPLATES.length} templates`);
  }
  console.log("Notification templates seeded.");
}

seed()
  .catch((err) => {
    console.error("Seeding notification templates failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
