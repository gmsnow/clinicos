import { ReportsView } from "@/components/reports/reports-view";

export const dynamic = "force-dynamic";

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  return <ReportsView period="monthly" from={from} to={to} />;
}
