"use client";

import Link from "next/link";
import { AlertTriangle, Boxes, Coins, PackageCheck, ReceiptText, RefreshCw, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Skeleton } from "@/components/shared/skeleton";
import { QueueGroupSection } from "@/components/partner/today/queue-group";
import { SalesSparkline } from "@/components/partner/today/sales-sparkline";
import { useOutletToday } from "@/hooks/use-partner-today";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { piastresToEgp } from "@/lib/catalog";

const PAYMENT_LABELS = { CASH: "نقدًا", INSTAPAY: "إنستاباي", CARD: "بطاقة" } as const;

/**
 * اليوم for an outlet (backlog 11.2, plan `12-distributor-store-plan.md` §3): shop sales and
 * stock only — no order queue or SLA groups. Same shell/KPI/panel components as the
 * agent's اليوم, so the two portals read as one family.
 */
export function OutletTodayView({ partnerName }: { partnerName?: string }) {
  const { data, isLoading, isError, refetch } = useOutletToday();

  const now = new Date();
  const weekday = now.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long" });
  const monthYear = now.toLocaleDateString("ar-EG-u-nu-latn", { month: "long", year: "numeric" });
  const dateLine = `${weekday} ${formatNumberEn(now.getDate())} ${monthYear}`;

  return (
    <div>
      <PageHeader title="اليوم" description={partnerName ? `${dateLine} · ${partnerName}` : dateLine} />

      {isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-2xl border border-carnelian-500/30 bg-danger-bg p-5 text-danger-text shadow-soft sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            تعذر تحميل البيانات
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs font-bold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div data-testid="kpi-sales-today">
              <KpiCard
                title="مبيعات اليوم"
                value={isLoading ? "" : formatNumberEn(piastresToEgp(data?.kpis.revenueTodayPiastres ?? 0))}
                icon={<Coins className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint={data ? `${formatNumberEn(data.kpis.salesCountToday)} إيصال · ج.م` : undefined}
              />
            </div>
            <div data-testid="kpi-units-sold">
              <KpiCard
                title="قطع مباعة اليوم"
                value={isLoading ? "" : formatNumberEn(data?.kpis.unitsSoldToday ?? 0)}
                icon={<PackageCheck className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
              />
            </div>
            <div data-testid="kpi-stock-value">
              <KpiCard
                title="قيمة المخزون"
                value={isLoading ? "" : formatNumberEn(piastresToEgp(data?.kpis.stockValuePiastres ?? 0))}
                icon={<Boxes className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint={data ? `${formatNumberEn(data.kpis.sellableUnits)} قطعة قابلة للبيع · ج.م` : undefined}
              />
            </div>
            <div data-testid="kpi-stock-alerts">
              <KpiCard
                title="تنبيهات المخزون"
                value={isLoading ? "" : formatNumberEn(data?.kpis.underThresholdCount ?? 0)}
                icon={<TriangleAlert className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint="أصناف تحت حد التنبيه"
                delta={
                  data && data.kpis.underThresholdCount > 0
                    ? { tone: "down", text: `+${formatNumberEn(data.kpis.underThresholdCount)}` }
                    : { tone: "flat", text: "—" }
                }
              />
            </div>
          </div>

          <PanelCard title="المبيعات آخر 14 يومًا" noPadding>
            <div className="px-3 pb-3 pt-2 sm:px-4">
              {isLoading ? (
                <Skeleton className="h-[120px] w-full rounded-xl" />
              ) : (
                <SalesSparkline points={data?.trend ?? []} />
              )}
            </div>
          </PanelCard>

          <PanelCard title="ما يحتاج انتباهك" description="مخزون يوشك على النفاد وآخر إيصالات البيع." noPadding>
            {isLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-40 rounded" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : !data ? null : (
              <div>
                <QueueGroupSection
                  first
                  testId="queue-group-low-stock"
                  rowKey={(row) => row.variantId}
                  title="مخزون تحت الحد"
                  tone="warning"
                  count={data.queue.lowStock.count}
                  rows={data.queue.lowStock.rows}
                  moreCount={data.queue.lowStock.moreCount}
                  viewAllHref="/partner/stock?lowStock=1"
                  renderRow={(row) => (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap sm:gap-3.5">
                      <span className="min-w-0 truncate text-sm font-bold text-ink sm:w-64 sm:shrink-0">
                        {row.productName} — {row.variantName}
                      </span>
                      <span dir="ltr" className="shrink-0 text-sm font-bold text-ink">
                        {formatNumberEn(row.sellable)} قابل للبيع
                      </span>
                      <span className="min-w-0 flex-1 text-xs text-ink-soft">
                        الحد <span dir="ltr">{formatNumberEn(row.threshold)}</span>
                      </span>
                    </div>
                  )}
                />
                <ReceiptsGroup receipts={data.queue.recentReceipts} first={data.queue.lowStock.count === 0} />
                {data.queue.lowStock.count === 0 && data.queue.recentReceipts.length === 0 && (
                  <p className="p-8 text-center text-sm text-ink-soft">
                    لا توجد مبيعات بعد — ابدأ أول عملية بيع من «المبيعات».
                  </p>
                )}
              </div>
            )}
          </PanelCard>
        </div>
      )}
    </div>
  );
}

function ReceiptsGroup({
  receipts,
  first,
}: {
  receipts: { id: string; receiptNo: number; soldAt: string; totalPiastres: number; paymentMethod: keyof typeof PAYMENT_LABELS }[];
  first: boolean;
}) {
  if (receipts.length === 0) return null;
  return (
    <div className={first ? "" : "border-t border-stone-100"} data-testid="queue-group-receipts">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5 sm:px-5">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-ink">
          <ReceiptText className="h-4 w-4 text-ink-soft" />
          آخر الإيصالات
        </h3>
        <Link
          href="/partner/sales"
          className="text-xs font-bold text-lapis-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          عرض الكل
        </Link>
      </div>
      {receipts.map((r) => (
        <Link
          key={r.id}
          href={`/partner/sales/${r.id}`}
          data-testid={`receipt-row-${r.receiptNo}`}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 px-4 py-2.5 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 sm:flex-nowrap sm:gap-3.5 sm:px-5"
        >
          <span dir="ltr" className="shrink-0 text-xs font-bold text-ink-soft sm:w-20">
            #{formatNumberEn(r.receiptNo)}
          </span>
          <span className="min-w-0 flex-1 text-xs text-ink-soft">{formatRelativeTimeAr(r.soldAt)}</span>
          <span className="shrink-0 text-xs text-ink-soft">{PAYMENT_LABELS[r.paymentMethod]}</span>
          <span dir="ltr" className="shrink-0 text-sm font-bold text-ink sm:w-24">
            {formatNumberEn(piastresToEgp(r.totalPiastres))} ج.م
          </span>
        </Link>
      ))}
    </div>
  );
}
