import { Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { requirePermission } from "@/core/auth/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { ListShell, ListRow } from "@/components/data/list-shell";
import { fmtDate, fmtMoney } from "@/lib/format";

export default async function WalletTransfersPage() {
  const user = await requirePermission("financial:read");
  const locale = await getLocale();
  const t = await getTranslations("wallet-transfers");
  const tp = await getTranslations("patients");
  const clinicId = user.currentClinicId;

  const walletLabels: Record<string, string> = {
    JAWALI: tp("wallet_JAWALI"),
    FLOUSAK: tp("wallet_FLOUSAK"),
    JAIB: tp("wallet_JAIB"),
    ALKURAIMI: tp("wallet_ALKURAIMI"),
    ALAMQI: tp("wallet_ALAMQI"),
    MOBILE_MONEY: tp("wallet_MOBILE_MONEY"),
    BASTA: tp("wallet_BASTA"),
  };

  const transfers = clinicId
    ? await prisma.patient.findMany({
        where: { clinicId, paymentMethod: "WALLET" },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          mrn: true,
          firstNameAr: true,
          secondNameAr: true,
          lastNameAr: true,
          walletProvider: true,
          walletTxnRef: true,
          price: true,
          createdAt: true,
        },
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("subtitle")} icon={Wallet} />
      {transfers.length === 0 ? (
        <EmptyState icon={Wallet} title={t("empty")} description={t("emptyDesc")} />
      ) : (
        <ListShell>
          {transfers.map((p, i) => {
            const name =
              [p.firstNameAr, p.secondNameAr, p.lastNameAr].filter(Boolean).join(" ") || "—";
            const wallet = p.walletProvider
              ? (walletLabels[p.walletProvider] ?? p.walletProvider)
              : "—";
            return (
              <ListRow key={p.id} index={i} href={`/${locale}/patients/${p.id}`}>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[p.mrn, wallet, p.walletTxnRef].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {fmtMoney(Number(p.price))}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                  {fmtDate(p.createdAt, locale)}
                </span>
              </ListRow>
            );
          })}
        </ListShell>
      )}
    </div>
  );
}
