import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addDays } from "date-fns";
import { fmtInt, fmtMoney } from "@/lib/format";
import type { ReportData, ReportSlice } from "@/lib/reports/report-data";

export interface ReportPdfLabels {
  title: string;
  periodName: string;
  cardsPatients: string;
  cardsAppointments: string;
  cardsEncounter: string;
  cardsRevenue: string;
  revenueTrend: string;
  appointmentsTrend: string;
  statusSplit: string;
  genderSplit: string;
  topServices: string;
  wardsByDoctor: string;
  noData: string;
  generatedAt: string;
  reportRange: string;
  clinic: string;
  generatedBy: string;
}

export interface ReportPdfInput {
  data: ReportData;
  locale: string;
  clinicName: string;
  generatedBy: string;
  labels: ReportPdfLabels;
  statusRows: ReportSlice[];
  serviceRows: ReportSlice[];
}

const BLUE = "#2563eb";
const GREEN = "#16a34a";
const VIOLET = "#7c3aed";
const AMBER = "#f59e0b";
const SKY = "#0ea5e9";

const FONT_CACHE = new Map<string, string>();

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontCss(): string {
  const cached = FONT_CACHE.get("css");
  if (cached) return cached;

  const dir = path.join(process.cwd(), "public", "fonts");
  const weights = [400, 500, 600, 700];

  const face = (file: string, weight: number, family: string) => {
    try {
      const b64 = fs.readFileSync(path.join(dir, file)).toString("base64");
      return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    } catch {
      return "";
    }
  };

  const css =
    weights.map((w) => face(`plex-arabic-${w}.woff2`, w, "ReportArabic")).join("") +
    weights.map((w) => face(`plex-latin-${w}.woff2`, w, "ReportLatin")).join("");

  FONT_CACHE.set("css", css);
  return css;
}

function barChartSvg(
  points: { label: string; value: number }[],
  color: string,
  opts: { height?: number; money?: boolean } = {},
): string {
  const width = 520;
  const height = opts.height ?? 170;
  const padTop = 20;
  const padBottom = 22;
  const padSide = 4;
  const chartH = height - padTop - padBottom;
  const n = points.length || 1;
  const max = Math.max(1, ...points.map((p) => p.value));
  const gap = n > 12 ? 2 : 6;
  const barW = Math.max(2, (width - padSide * 2 - gap * (n - 1)) / n);

  const bars = points
    .map((p, i) => {
      const h = Math.round((p.value / max) * chartH);
      const x = padSide + i * (barW + gap);
      const y = padTop + (chartH - h);
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h}" rx="2" fill="${color}"/>`;
    })
    .join("");

  const step = Math.ceil(n / 12);
  const labels = points
    .map((p, i) => {
      if (i % step !== 0) return "";
      const x = padSide + i * (barW + gap) + barW / 2;
      return `<text x="${x.toFixed(1)}" y="${height - 6}" font-size="8" fill="#64748b" text-anchor="middle">${esc(p.label)}</text>`;
    })
    .join("");

  const baseline = `<line x1="${padSide}" y1="${padTop + chartH}" x2="${width - padSide}" y2="${padTop + chartH}" stroke="#e2e8f0" stroke-width="1"/>`;
  const maxText = opts.money
    ? `<text x="${padSide}" y="12" font-size="9" fill="#94a3b8">${esc(fmtMoney(max))}</text>`
    : `<text x="${padSide}" y="12" font-size="9" fill="#94a3b8">${esc(fmtInt(max))}</text>`;

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMidYMid meet">${maxText}${baseline}${bars}${labels}</svg>`;
}

function hbarRows(rows: ReportSlice[], color: string, noData: string, money = false): string {
  if (!rows.length || rows.every((r) => r.value === 0)) {
    return `<p class="empty">${esc(noData)}</p>`;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  return rows
    .map((r) => {
      const pct = Math.max(2, Math.round((r.value / max) * 100));
      const display = money ? fmtMoney(r.value) : fmtInt(r.value);
      return `<div class="row"><div class="row-head"><span class="row-name">${esc(r.name)}</span><span class="row-val">${esc(display)}</span></div><div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div></div>`;
    })
    .join("");
}

function kpi(label: string, value: string, color: string): string {
  return `<div class="kpi"><div class="kpi-bar" style="background:${color}"></div><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div></div>`;
}

export function renderReportHtml(input: ReportPdfInput): string {
  const { data, locale, clinicName, generatedBy, labels } = input;
  const rtl = locale === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const fontStack = rtl
    ? "'ReportArabic','ReportLatin',sans-serif"
    : "'ReportLatin','ReportArabic',sans-serif";

  const dateFmt = new Intl.DateTimeFormat(rtl ? "ar" : "en", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const rangeLabel =
    data.days === 1
      ? dateFmt.format(data.start)
      : `${dateFmt.format(data.start)} — ${dateFmt.format(addDays(data.end, -1))}`;

  const generatedAt = new Intl.DateTimeFormat(rtl ? "ar" : "en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());

  const revenuePoints = data.revenueSeries.map((p) => ({ label: p.label, value: p.value }));
  const apptPoints = data.appointmentsSeries.map((p) => ({ label: p.label, value: p.count }));

  return `<!doctype html>
<html dir="${dir}" lang="${esc(locale)}">
<head>
<meta charset="utf-8"/>
<style>
${fontCss()}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:${fontStack};color:#0f172a;font-size:11px;line-height:1.5;padding:0}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:2px solid ${BLUE};padding-bottom:10px;margin-bottom:14px}
.header .brand{font-size:18px;font-weight:700;color:${BLUE}}
.header .title{font-size:15px;font-weight:600;margin-top:4px}
.header .meta{text-align:${rtl ? "left" : "right"};color:#475569;font-size:10px}
.header .meta div{margin-bottom:2px}
.header .meta b{color:#0f172a;font-weight:600}
.kpis{display:flex;gap:10px;margin-bottom:16px}
.kpi{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px;position:relative;overflow:hidden}
.kpi-bar{position:absolute;top:0;${rtl ? "right" : "left"}:0;width:100%;height:3px}
.kpi-label{font-size:10px;color:#64748b;margin-bottom:6px}
.kpi-value{font-size:18px;font-weight:700}
.section{border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:14px}
.section h2{font-size:12px;font-weight:600;margin-bottom:8px;color:#0f172a}
.grid2{display:flex;gap:14px;margin-bottom:14px}
.grid2 .section{flex:1;margin-bottom:0}
.row{margin-bottom:8px}
.row-head{display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px;gap:8px}
.row-name{color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row-val{color:#0f172a;font-weight:600;white-space:nowrap}
.track{height:7px;background:#f1f5f9;border-radius:4px;overflow:hidden}
.fill{height:100%;border-radius:4px}
.empty{color:#94a3b8;font-size:10px;padding:10px 0;text-align:center}
.footer{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px;color:#64748b;font-size:9px;display:flex;justify-content:space-between}
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="brand">${esc(clinicName || labels.title)}</div>
    <div class="title">${esc(labels.title)} — ${esc(labels.periodName)}</div>
  </div>
  <div class="meta">
    <div><b>${esc(labels.reportRange)}:</b> ${esc(rangeLabel)}</div>
    <div><b>${esc(labels.generatedAt)}:</b> ${esc(generatedAt)}</div>
    <div><b>${esc(labels.generatedBy)}:</b> ${esc(generatedBy)}</div>
  </div>
</div>

<div class="kpis">
  ${kpi(labels.cardsPatients, fmtInt(data.patientsCount), BLUE)}
  ${kpi(labels.cardsAppointments, fmtInt(data.appointmentsCount), SKY)}
  ${kpi(labels.cardsEncounter, fmtInt(data.encountersCount), VIOLET)}
  ${kpi(labels.cardsRevenue, fmtMoney(data.revenue), GREEN)}
</div>

<div class="section">
  <h2>${esc(labels.revenueTrend)}</h2>
  ${barChartSvg(revenuePoints, BLUE, { money: true })}
</div>

<div class="section">
  <h2>${esc(labels.appointmentsTrend)}</h2>
  ${barChartSvg(apptPoints, GREEN)}
</div>

<div class="grid2">
  <div class="section">
    <h2>${esc(labels.statusSplit)}</h2>
    ${hbarRows(input.statusRows, SKY, labels.noData)}
  </div>
  <div class="section">
    <h2>${esc(labels.genderSplit)}</h2>
    ${hbarRows(data.genderSplit, VIOLET, labels.noData)}
  </div>
</div>

<div class="grid2">
  <div class="section">
    <h2>${esc(labels.topServices)}</h2>
    ${hbarRows(input.serviceRows, AMBER, labels.noData, true)}
  </div>
  <div class="section">
    <h2>${esc(labels.wardsByDoctor)}</h2>
    ${hbarRows(
      data.visitsByDoctor.map((d) => ({ name: d.label, value: d.count })),
      GREEN,
      labels.noData,
    )}
  </div>
</div>
</body>
</html>`;
}

function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_EXECUTION_ENV,
  );
}

function findLocalChromium(): string | undefined {
  const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  for (const candidate of [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const cacheRoot = path.join(os.homedir(), ".cache", "ms-playwright");
  try {
    for (const dir of fs.readdirSync(cacheRoot)) {
      if (!dir.startsWith("chromium")) continue;
      const full = path.join(cacheRoot, dir);
      for (const sub of fs.readdirSync(full)) {
        const exe = path.join(full, sub, "chrome");
        if (fs.existsSync(exe)) return exe;
      }
    }
  } catch {
    // ms-playwright cache not present
  }
  return undefined;
}

async function getBrowser(): Promise<import("puppeteer-core").Browser> {
  const puppeteer = await import("puppeteer-core");

  if (isServerless()) {
    const { default: chromium } = await import("@sparticuz/chromium");
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 794, height: 1123 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath = findLocalChromium();
  if (!executablePath) {
    throw new Error(
      "No local Chromium found. Set CHROME_PATH or install Chrome/Chromium.",
    );
  }
  return puppeteer.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 794, height: 1123 },
    executablePath,
    headless: true,
  });
}

export async function generateReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const html = renderReportHtml(input);
  const browser = await getBrowser();

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "14mm", left: "10mm", right: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
