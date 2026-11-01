"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ReportPeriod } from "@/lib/reports/report-data";

function pdfUrl(period: ReportPeriod, locale: string, from?: string, to?: string) {
  const params = new URLSearchParams({ locale });
  if (from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  return `/api/reports/${period}/pdf?${params.toString()}`;
}

export function ReportActions({
  period,
  from,
  to,
}: {
  period: ReportPeriod;
  from?: string;
  to?: string;
}) {
  const t = useTranslations("reports");
  const locale = useLocale();
  const [busy, setBusy] = useState<"print" | "download" | null>(null);

  async function fetchPdf() {
    const res = await fetch(pdfUrl(period, locale, from, to));
    if (!res.ok) throw new Error(String(res.status));
    return res.blob();
  }

  function save(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = from && to
      ? `report-${period}-${from}_${to}.pdf`
      : `report-${period}-${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleDownload() {
    setBusy("download");
    try {
      save(await fetchPdf());
    } catch {
      toast.error(t("downloadFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function handlePrint() {
    setBusy("print");
    const win = window.open("", "_blank");
    try {
      const blob = await fetchPdf();
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        save(blob);
      }
    } catch {
      win?.close();
      toast.error(t("downloadFailed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button
        type="button"
        variant="outline"
        onClick={handleDownload}
        disabled={busy !== null}
        aria-label={t("downloadPdf")}
      >
        {busy === "download" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Download className="size-4" />
        )}
        <span className="hidden sm:inline">{t("downloadPdf")}</span>
      </Button>
      <Button
        type="button"
        onClick={handlePrint}
        disabled={busy !== null}
        className="shadow-sm"
      >
        {busy === "print" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Printer className="size-4" />
        )}
        <span className="hidden sm:inline">
          {busy === "print" ? t("generating") : t("printPdf")}
        </span>
      </Button>
    </div>
  );
}
