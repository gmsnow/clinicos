"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Check, ChevronDown, RotateCcw } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shift(days: number) {
  const now = new Date();
  return toIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + days));
}

function formatDate(value: string, locale: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function ReportRangePicker({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const t = useTranslations("reports");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from ?? "");
  const [end, setEnd] = useState(to ?? "");
  const [error, setError] = useState(false);

  useEffect(() => {
    setStart(from ?? "");
    setEnd(to ?? "");
    setError(false);
  }, [from, to]);

  const hasRange = Boolean(from && to);
  const label = hasRange
    ? `${formatDate(from!, locale)} — ${formatDate(to!, locale)}`
    : t("dateRange");

  function navigate(nextFrom: string | null, nextTo: string | null) {
    setOpen(false);
    if (!nextFrom || !nextTo) {
      router.replace(pathname as never, { scroll: false });
      return;
    }
    router.replace(
      `${pathname}?from=${nextFrom}&to=${nextTo}` as never,
      { scroll: false },
    );
  }

  function apply() {
    if (!start || !end || end < start) {
      setError(true);
      return;
    }
    setError(false);
    navigate(start, end);
  }

  function preset(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    setError(false);
    navigate(nextStart, nextEnd);
  }

  const presets = [
    { key: "rangeToday", start: shift(0), end: shift(0) },
    { key: "range7", start: shift(-6), end: shift(0) },
    { key: "range30", start: shift(-29), end: shift(0) },
    { key: "rangeMonth", start: `${shift(0).slice(0, 8)}01`, end: shift(0) },
  ] as const;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="max-w-full justify-start gap-2 font-normal"
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="ms-1 size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {presets.map((p) => (
              <Button
                key={p.key}
                type="button"
                variant="secondary"
                size="sm"
                className="justify-start font-normal"
                onClick={() => preset(p.start, p.end)}
              >
                {t(p.key)}
              </Button>
            ))}
          </div>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="report-from">{t("rangeFrom")}</Label>
              <Input
                id="report-from"
                type="date"
                value={start}
                max={end || undefined}
                onChange={(e) => {
                  setStart(e.target.value);
                  setError(false);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="report-to">{t("rangeTo")}</Label>
              <Input
                id="report-to"
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => {
                  setEnd(e.target.value);
                  setError(false);
                }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs font-medium text-destructive">
              {t("rangeInvalid")}
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            {hasRange ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => navigate(null, null)}
              >
                <RotateCcw className="size-3.5" />
                {t("rangeReset")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="button" size="sm" onClick={apply}>
              <Check className="size-4" />
              {t("rangeApply")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
