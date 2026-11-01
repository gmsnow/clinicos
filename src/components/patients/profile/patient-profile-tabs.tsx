"use client";

import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { PROFILE_TABS, type ProfileTabId } from "@/lib/patient-profile/tabs";
import type { ProfileCounts } from "@/lib/patient-profile/queries";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

const TONE: Record<string, string> = {
  overview: "var(--primary)",
  history: "var(--info)",
  diagnoses: "var(--success)",
  allergies: "var(--warning)",
  medications: "var(--violet)",
  prescriptions: "var(--chart-2)",
  lab: "var(--chart-4)",
  imaging: "var(--chart-5)",
  procedures: "var(--chart-1)",
  notes: "var(--chart-6)",
  vitals: "var(--destructive)",
  documents: "var(--muted-foreground)",
  billing: "var(--warning)",
  followup: "var(--info)",
  referrals: "var(--chart-4)",
  audit: "var(--muted-foreground)",
} as const;

export function PatientProfileTabs({
  active,
  counts,
}: {
  active: ProfileTabId;
  counts: ProfileCounts;
}) {
  const t = useTranslations("patients");
  const router = useRouter();
  const pathname = usePathname();
  const reduce = useReducedMotion();

  function go(tabId: ProfileTabId) {
    if (tabId === active) return;
    router.push(`${pathname}?tab=${tabId}`, { scroll: false });
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="grid gap-1 overflow-x-auto pb-1"
      style={{
        gridTemplateRows: "repeat(2, minmax(0, 1fr))",
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(80px, 1fr)",
      } as React.CSSProperties}
      role="tablist"
      aria-label={t("profileTabs")}
    >
      {PROFILE_TABS.map((tab, i) => {
        const Icon = tab.icon;
        const count = counts[tab.id];
        const isActive = tab.id === active;
        const accent = TONE[tab.id];
        return (
<motion.div
            key={tab.id}
            initial={reduce ? false : { opacity: 0, y: 4, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.02 + i * 0.015, ease: EASE }}
            className="min-w-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => go(tab.id)}
              style={{ "--qa-accent": accent } as React.CSSProperties}
              className={cn(
                "group relative flex flex-col h-full w-full items-start gap-1 overflow-hidden rounded bg-card px-1.5 py-1.5 transition-all duration-150",
                "hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--qa-accent)_50%,var(--border))]",
                "hover:shadow-sm hover:shadow-[color-mix(in_srgb,var(--qa-accent)_10%,transparent)]",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:opacity-50 disabled:pointer-events-none",
                isActive &&
                  "border-[color-mix(in_srgb,var(--qa-accent)_70%,var(--border))] bg-gradient-to-br from-[color-mix(in_srgb,var(--qa-accent)_8%,var(--card))] to-[color-mix(in_srgb,var(--qa-accent)_3%,var(--card))] shadow-[color-mix(in_srgb,var(--qa-accent)_8%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--qa-accent)_30%,var(--border))]",
              )}
              disabled={isActive}
            >
              <div className="flex w-full items-start justify-between gap-1">
                <div
                  className="flex size-6 shrink-0 items-center justify-center rounded transition-transform duration-150 group-hover:scale-105"
                  style={{
                    background: "color-mix(in srgb, var(--qa-accent) 12%, transparent)",
                    color: "var(--qa-accent)",
                  }}
                >
                  <Icon className="size-3" aria-hidden />
                </div>

                {typeof count === "number" && count > 0 && (
                  <span className={cn(
                    "flex shrink-0 items-center justify-center rounded-full px-1 py-0.5 text-[8px] font-semibold tabular-nums transition-all duration-150",
                    isActive
                      ? "bg-[color-mix(in_srgb,var(--qa-accent)_20%,var(--background))] text-[var(--qa-accent)]"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {count}
                  </span>
                )}
              </div>

              <span className="truncate text-[10px] font-medium leading-snug w-full sm:text-[11px]">
                {t(tab.labelKey)}
              </span>

              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-hover:animate-sheen"
              />
            </button>
          </motion.div>
        );
      })}
    </motion.div>
  );
}