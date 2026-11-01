"use client";

import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck2,
  CalendarPlus,
  ChartNoAxesColumn,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FlaskConical,
  Hourglass,
  Minus,
  Pill,
  Receipt,
  Stethoscope,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StatTone = "primary" | "success" | "warning" | "info" | "danger" | "violet";
export type StatFormat = "int" | "money";
export type StatHref = React.ComponentProps<typeof Link>["href"];

export type StatIcon =
  | "calendar"
  | "hourglass"
  | "stethoscope"
  | "check"
  | "wallet"
  | "trending"
  | "users"
  | "checkCircle"
  | "xCircle"
  | "clipboard"
  | "flask"
  | "pill"
  | "receipt"
  | "chartBar"
  | "calendarPlus"
  | "user"
  | "calendarCheck"
  | "dollarSign";

const ICONS = {
  calendar: CalendarPlus,
  hourglass: Hourglass,
  stethoscope: Stethoscope,
  check: CheckCircle2,
  wallet: Wallet,
  trending: TrendingUp,
  users: Users,
  checkCircle: CheckCircle2,
  xCircle: XCircle,
  clipboard: ClipboardList,
  flask: FlaskConical,
  pill: Pill,
  receipt: Receipt,
  chartBar: ChartNoAxesColumn,
  calendarPlus: CalendarPlus,
  user: UserRound,
  calendarCheck: CalendarCheck2,
  dollarSign: DollarSign,
} as const satisfies Record<StatIcon, LucideIcon>;

const TONE: Record<StatTone, string> = {
  primary: "var(--primary)",
  success: "var(--success)",
  warning: "var(--warning)",
  info: "var(--info)",
  danger: "var(--destructive)",
  violet: "var(--chart-4)",
};

const EASE = [0.16, 1, 0.3, 1] as const;

export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 1.1, ease: EASE });
    return () => controls.stop();
  }, [mv, reduce, value]);

  if (reduce) {
    return <span className={className}>{format(value)}</span>;
  }
  return (
    <motion.span className={cn("tabular-nums", className)}>
      {text}
    </motion.span>
  );
}

export function StatCard({
  icon,
  label,
  value,
  format = "int",
  locale = "en",
  tone = "primary",
  delta,
  deltaLabel,
  href,
  index = 0,
}: {
  icon: StatIcon;
  label: string;
  value: number;
  format?: StatFormat;
  locale?: string;
  tone?: StatTone;
  delta?: { value: number; direction: "up" | "down" | "flat" };
  deltaLabel?: string;
  href?: StatHref;
  index?: number;
}) {
  const reduce = useReducedMotion();
  const Icon = ICONS[icon];
  const accent = TONE[tone];
  const render = format === "money" ? fmtMoney : (n: number) => new Intl.NumberFormat(locale).format(Math.round(n));
  const DeltaIcon =
    delta?.direction === "up" ? ArrowUpRight : delta?.direction === "down" ? ArrowDownRight : Minus;
  const deltaTone =
    delta?.direction === "flat" ? "text-muted-foreground" : delta?.direction === "up" ? "text-success" : "text-destructive";

  const card = (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.06, ease: EASE }}
      style={{ "--stat-accent": accent } as React.CSSProperties}
      className={cn(
        "group relative h-full overflow-hidden rounded-xl border bg-card p-3 sm:p-4",
        "transition-all duration-300",
        "hover:-translate-y-1 hover:border-[color-mix(in_srgb,var(--stat-accent)_45%,var(--border))]",
        "hover:shadow-lg hover:shadow-[color-mix(in_srgb,var(--stat-accent)_12%,transparent)]",
      )}
    >
      {/* accent hairline */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px opacity-40 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "linear-gradient(to right, transparent, color-mix(in srgb, var(--stat-accent) 85%, transparent), transparent)",
        }}
      />
      {/* tinted bloom on hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute -end-8 -top-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-25"
        style={{ background: "var(--stat-accent)" }}
      />

      <div className="relative flex items-start justify-between gap-2">
        <span
          className="flex size-9 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
          style={{
            background: "color-mix(in srgb, var(--stat-accent) 14%, transparent)",
            color: "var(--stat-accent)",
          }}
        >
          <Icon className="size-4.5" aria-hidden />
        </span>

        {delta && (
          <span
            className={cn(
              "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium transition-transform duration-300 group-hover:scale-105",
              deltaTone,
            )}
            style={{
              background: "color-mix(in srgb, var(--stat-accent) 10%, transparent)",
            }}
          >
            <DeltaIcon className="size-3" aria-hidden />
            <span dir="ltr">{Math.abs(delta.value).toFixed(1)}%</span>
          </span>
        )}
      </div>

      <p className="relative mt-3 text-xs font-medium tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="relative mt-0.5 truncate text-2xl font-semibold tracking-tight">
        <CountUp value={value} format={render} />
      </p>

      {deltaLabel && (
        <p className="relative mt-1 text-[10px] text-muted-foreground/80 sm:text-[11px]">{deltaLabel}</p>
      )}
    </motion.div>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {card}
    </Link>
  );
}