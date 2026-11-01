import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for how a domain status maps to a visual tone.
 * Replaces seven copy-pasted badge maps spread across appointments, billing,
 * lab, imaging, inventory and encounters.
 *
 * Labels are never stored here — each page passes its own translated string,
 * so the map stays locale-agnostic.
 */
export type StatusTone = "default" | "info" | "success" | "warning" | "danger" | "muted";

export const STATUS_TONE: Record<string, StatusTone> = {
  // appointments
  SCHEDULED: "info",
  CONFIRMED: "info",
  ARRIVED: "warning",
  IN_SERVICE: "default",
  COMPLETED: "success",
  CANCELLED: "muted",
  NO_SHOW: "danger",
  // encounters
  IN_PROGRESS: "warning",
  // visits
  REGISTERED: "info",
  TRIAGE: "warning",
  WAITING: "warning",
  UNDER_EXAMINATION: "warning",
  AWAITING_RESULTS: "info",
  AWAITING_REVIEW: "warning",
  REFERRED: "info",
  // visit priority
  NORMAL: "info",
  URGENT: "warning",
  EMERGENCY: "danger",
  // invoices
  DRAFT: "muted",
  OPEN: "warning",
  PAID: "success",
  VOID: "muted",
  // lab requests
  PENDING: "warning",
  SAMPLED: "info",
  RESULTED: "info",
  VERIFIED: "success",
  // medical orders / prescriptions
  ACTIVE: "info",
  // imaging
  REQUESTED: "warning",
  SCHEDULED_IMAGING: "info",
  PERFORMED: "info",
  REPORTED: "success",
  // stock
  OUT_OF_STOCK: "danger",
  LOW_STOCK: "warning",
  IN_STOCK: "success",
  // misc
  ACTIVE_USER: "success",
  INACTIVE: "muted",
};

const TONE_STYLE: Record<StatusTone, { bg: string; fg: string }> = {
  default: { bg: "var(--primary)", fg: "var(--primary-foreground)" },
  info: { bg: "var(--info)", fg: "var(--info)" },
  success: { bg: "var(--success)", fg: "var(--success)" },
  warning: { bg: "var(--warning)", fg: "var(--warning)" },
  danger: { bg: "var(--destructive)", fg: "var(--destructive)" },
  muted: { bg: "var(--muted-foreground)", fg: "var(--muted-foreground)" },
};

export function toneColors(tone: StatusTone) {
  return TONE_STYLE[tone];
}

/**
 * Status pill with a leading dot. Colour is derived from the status value, so
 * callers only supply the translated label.
 */
export function StatusBadge({
  status,
  children,
  tone,
  dot = true,
  className,
}: {
  status: string;
  children: React.ReactNode;
  tone?: StatusTone;
  dot?: boolean;
  className?: string;
}) {
  const resolved = tone ?? STATUS_TONE[status] ?? "default";
  const colors = TONE_STYLE[resolved];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        "transition-transform duration-200 hover:scale-105",
        className,
      )}
      style={{
        background: `color-mix(in srgb, ${colors.bg} 14%, transparent)`,
        color: colors.fg,
      }}
    >
      {dot && (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: colors.fg }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}