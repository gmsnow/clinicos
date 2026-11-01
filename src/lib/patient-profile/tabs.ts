import {
  CalendarClock,
  FileText,
  FlaskConical,
  FolderOpen,
  HeartPulse,
  History,
  LayoutDashboard,
  Pill,
  Receipt,
  Scan,
  ScrollText,
  Share2,
  Stethoscope,
  Syringe,
  TriangleAlert,
} from "lucide-react";

export const PROFILE_TABS = [
  { id: "overview", labelKey: "tabOverview", icon: LayoutDashboard },
  { id: "history", labelKey: "tabHistory", icon: History },
  { id: "diagnoses", labelKey: "tabDiagnoses", icon: Stethoscope },
  { id: "allergies", labelKey: "tabAllergies", icon: TriangleAlert },
  { id: "medications", labelKey: "tabMedications", icon: Pill },
  { id: "lab", labelKey: "tabLab", icon: FlaskConical },
  { id: "imaging", labelKey: "tabImaging", icon: Scan },
  { id: "procedures", labelKey: "tabProcedures", icon: Syringe },
  { id: "notes", labelKey: "tabNotes", icon: FileText },
  { id: "documents", labelKey: "tabDocuments", icon: FolderOpen },
  { id: "billing", labelKey: "tabBilling", icon: Receipt },
  { id: "followup", labelKey: "tabFollowUp", icon: CalendarClock },
  { id: "referrals", labelKey: "tabReferrals", icon: Share2 },
  { id: "audit", labelKey: "tabAudit", icon: ScrollText },
] as const;

export type ProfileTabId = (typeof PROFILE_TABS)[number]["id"];

export const DEFAULT_PROFILE_TAB: ProfileTabId = "overview";

const TAB_IDS = new Set<string>(PROFILE_TABS.map((tab) => tab.id));

export function isProfileTabId(value: unknown): value is ProfileTabId {
  return typeof value === "string" && TAB_IDS.has(value);
}

export function resolveProfileTab(value: unknown): ProfileTabId {
  return isProfileTabId(value) ? value : DEFAULT_PROFILE_TAB;
}