/**
 * Central RBAC catalogue: permissions and role -> permission mapping.
 * Enforcement happens server-side (see core/rbac/index.ts).
 * Seed data mirrors this catalogue (prisma/seed.ts).
 */

export const MODULES = [
  "patients",
  "appointments",
  "reception",
  "queue",
  "encounters",
  "laboratory",
  "pharmacy",
  "imaging",
  "inventory",
  "billing",
  "financial",
  "reports",
  "insurance",
  "procurement",
  "accounting",
  "staff",
  "audit",
  "settings",
  "users",
  "diagnosis",
  "drug",
  "template",
  "reconciliation",
  "notifications",
] as const;

export const ACTIONS = ["read", "write", "sign", "order", "result", "verify", "dispense", "prescribe", "refund", "discount", "post", "manage", "report", "catalog", "perform", "amend", "send"] as const;

export type Module = (typeof MODULES)[number];
export type Action = (typeof ACTIONS)[number];

export type PermissionSpec = {
  code: string;
  module: Module;
  action: Action;
  descriptionAr: string;
  descriptionEn: string;
};

export const PERMISSION_CATALOG: PermissionSpec[] = [
  // patients
  h("patients", "read", "عرض سجلات المرضى", "View patient records"),
  h("patients", "write", "إنشاء وتعديل سجلات المرضى", "Create/update patient records"),
  // appointments
  h("appointments", "read", "عرض المواعيد", "View appointments"),
  h("appointments", "write", "إدارة المواعيد", "Manage appointments"),
  // reception
  h("reception", "read", "عرض شاشة الاستقبال", "View reception workspace"),
  h("reception", "write", "تسجيل الوصول والمغادرة", "Check-in/check-out"),
  // queue
  h("queue", "read", "عرض الطابور", "View queue board"),
  h("queue", "write", "إدارة الطابور", "Manage queue"),
  // encounters
  h("encounters", "read", "عرض الجلسات والملاحظات", "View encounters and notes"),
  h("encounters", "write", "كتابة وتعديل الملاحظات", "Write/edit notes"),
  h("encounters", "sign", "التوقيع على الملاحظات", "Sign clinical notes"),
  h("encounters", "amend", "تعديل الجلسات الموقعة", "Amend signed encounters"),
  // laboratory
  h("laboratory", "read", "عرض طلبات المختبر", "View laboratory orders"),
  h("laboratory", "order", "إنشاء طلبات مخبرية", "Create laboratory orders"),
  h("laboratory", "result", "إدخال النتائج", "Enter laboratory results"),
  h("laboratory", "verify", "اعتماد النتائج", "Verify laboratory results"),
  // pharmacy
  h("pharmacy", "read", "عرض الصيدلية", "View pharmacy"),
  h("pharmacy", "prescribe", "كتابة وصفات طبية", "Write prescriptions"),
  h("pharmacy", "dispense", "صرف الأدوية", "Dispense medications"),
  // imaging
  h("imaging", "read", "عرض طلبات التصوير", "View imaging requests"),
  h("imaging", "write", "تنفيذ وتعديل التصوير", "Perform imaging"),
  h("imaging", "report", "كتابة تقارير التصوير", "Write imaging reports"),
  // inventory
  h("inventory", "read", "عرض المخزون", "View inventory"),
  h("inventory", "write", "إدارة المخزون", "Manage inventory"),
  // billing
  h("billing", "read", "عرض الفواتير", "View invoices"),
  h("billing", "write", "إنشاء الفواتير", "Create invoices"),
  h("billing", "discount", "منح الخصومات", "Apply discounts"),
  h("billing", "refund", "معالجة الاسترداد", "Process refunds"),
  // financial
  h("financial", "read", "عرض البيانات المالية", "View financial data"),
  h("financial", "post", "ترحيل القيود المالية", "Post financial entries"),
  // reports
  h("reports", "read", "عرض التقارير", "View reports"),
  // insurance
  h("insurance", "read", "عرض التأمينات", "View insurance"),
  h("insurance", "write", "إدارة التأمينات والمطالبات", "Manage insurance & claims"),
  // procurement
  h("procurement", "read", "عرض المشتريات", "View procurement"),
  h("procurement", "write", "إدارة المشتريات", "Manage procurement"),
  // accounting
  h("accounting", "read", "عرض الحسابات", "View accounting"),
  h("accounting", "write", "إدارة الحسابات", "Manage accounting"),
  // staff
  h("staff", "read", "عرض بيانات الموظفين", "View staff"),
  h("staff", "write", "إدارة الموظفين", "Manage staff"),
  // audit
  h("audit", "read", "عرض سجل التدقيق", "View audit log"),
  // settings
  h("settings", "read", "عرض الإعدادات", "View settings"),
  h("settings", "write", "تعديل الإعدادات", "Edit settings"),
  // users
  h("users", "manage", "إدارة المستخدمين والأدوار", "Manage users & roles"),
  // diagnosis
  h("diagnosis", "read", "عرض التشخيصات", "View diagnoses"),
  h("diagnosis", "write", "إنشاء وتعديل التشخيصات", "Create/update diagnoses"),
  h("diagnosis", "manage", "إدارة كتالوج التشخيصات", "Manage diagnosis catalog"),
  // drug
  h("drug", "read", "عرض كتالوج الأدوية", "View drug catalog"),
  h("drug", "catalog", "إدارة كتالوج الأدوية والتفاعلات", "Manage drug catalog & interactions"),
  // template
  h("template", "read", "استخدام القوالب السريرية", "Use clinical templates"),
  h("template", "manage", "إدارة القوالب السريرية", "Manage clinical templates"),
  // reconciliation
  h("reconciliation", "read", "عرض مصالحة الأدوية", "View medication reconciliation"),
  h("reconciliation", "perform", "إجراء مصالحة الأدوية", "Perform medication reconciliation"),
  // notifications
  h("notifications", "read", "عرض الإشعارات", "View notifications"),
  h("notifications", "send", "إرسال الإشعارات", "Send notifications"),
  h("notifications", "manage", "إدارة قوالب الإشعارات", "Manage notification templates"),
];

function h(module: Module, action: Action, descriptionAr: string, descriptionEn: string): PermissionSpec {
  return { code: `${module}:${action}`, module, action, descriptionAr, descriptionEn };
}

export type PermissionCode = (typeof PERMISSION_CATALOG)[number]["code"];

export const ROLE_CODES = [
  "super_admin",
  "manager",
  "receptionist",
  "physician",
  "nurse",
  "lab_tech",
  "lab_reviewer",
  "imaging_tech",
  "pharmacist",
  "cashier",
  "accountant",
  "procurement",
  "inventory",
  "insurance",
  "auditor",
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

/** Grant list per role (expanded at seed time against PERMISSION_CATALOG). */
export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  super_admin: PERMISSION_CATALOG.map((p) => p.code as PermissionCode),
  manager: [
    "patients:read", "patients:write",
    "appointments:read", "appointments:write",
    "reception:read", "reception:write",
    "queue:read", "queue:write",
    "encounters:read", "encounters:write", "encounters:sign", "encounters:amend",
    "laboratory:read", "laboratory:order", "laboratory:verify",
    "pharmacy:read", "pharmacy:prescribe", "pharmacy:dispense",
    "imaging:read", "imaging:write", "imaging:report",
    "inventory:read", "inventory:write",
    "billing:read", "billing:write", "billing:discount", "billing:refund",
    "financial:read",
    "reports:read",
    "insurance:read", "insurance:write",
    "procurement:read", "procurement:write",
    "accounting:read", "accounting:write",
    "staff:read", "staff:write",
    "settings:read",
    "diagnosis:read", "diagnosis:write", "diagnosis:manage",
    "drug:read", "drug:catalog",
    "template:read", "template:manage",
    "reconciliation:read", "reconciliation:perform",
    "notifications:read", "notifications:send", "notifications:manage",
  ],
  receptionist: [
    "patients:read", "patients:write",
    "appointments:read", "appointments:write",
    "reception:read", "reception:write",
    "queue:read", "queue:write",
    "billing:read",
    "notifications:read",
  ],
  physician: [
    "patients:read",
    "appointments:read",
    "reception:read",
    "queue:read",
    "encounters:read", "encounters:write", "encounters:sign",
    "laboratory:read", "laboratory:order",
    "pharmacy:read", "pharmacy:prescribe",
    "imaging:read",
    "diagnosis:read", "diagnosis:write",
    "drug:read",
    "template:read",
    "reconciliation:read", "reconciliation:perform",
    "notifications:read",
  ],
  nurse: [
    "patients:read",
    "appointments:read",
    "reception:read",
    "queue:read", "queue:write",
    "encounters:read", "encounters:write",
    "imaging:read",
    "diagnosis:read",
    "template:read",
    "notifications:read",
  ],
  lab_tech: ["patients:read", "laboratory:read", "laboratory:order", "laboratory:result", "notifications:read"],
  lab_reviewer: ["patients:read", "laboratory:read", "laboratory:order", "laboratory:result", "laboratory:verify", "notifications:read"],
  imaging_tech: [
    "patients:read",
    "encounters:read",
    "queue:read",
    "imaging:read",
    "imaging:write",
    "imaging:report",
    "reports:read",
    "notifications:read",
  ],
  pharmacist: ["pharmacy:read", "pharmacy:dispense", "inventory:read", "drug:read", "drug:catalog", "reconciliation:read", "reconciliation:perform", "notifications:read"],
  cashier: ["patients:read", "billing:read", "billing:write", "notifications:read"],
  accountant: ["billing:read", "financial:read", "financial:post", "accounting:read", "accounting:write", "reports:read", "notifications:read"],
  procurement: ["procurement:read", "procurement:write", "inventory:read", "notifications:read"],
  inventory: ["inventory:read", "inventory:write", "pharmacy:read", "notifications:read"],
  insurance: ["insurance:read", "insurance:write", "billing:read", "notifications:read"],
  auditor: ["audit:read", "reports:read", "financial:read", "patients:read", "notifications:read"],
};