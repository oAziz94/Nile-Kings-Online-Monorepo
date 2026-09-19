"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerTopbarSlot } from "@/components/partner/partner-shell";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { PeriodBar } from "@/components/partner/reports/period-bar";
import { HeadlineTiles } from "@/components/partner/reports/headline-tiles";
import { TrendChart } from "@/components/partner/reports/trend-chart";
import { BreakdownTable } from "@/components/partner/reports/breakdown-table";
import { ProductIdentity } from "@/components/dashboard/product-identity";
import { ActionPanel } from "@/components/partner/reports/action-panel";
import { DeltaCell } from "@/components/partner/reports/delta-cell";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import { cn } from "@/lib/utils";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";
import type { SalesOrderSet, SalesReportResponse } from "@/lib/analytics/partner-sales-report";

const ORDER_SET_OPTIONS: { id: SalesOrderSet; label: string }[] = [
  { id: "accomplished", label: "المُنجَزة" },
  { id: "active", label: "النشطة" },
];

const ORDER_SET_EXPLAINER: Record<SalesOrderSet, string> = {
  accomplished: "تُحسب الأرقام من الطلبات المُسلَّمة فقط.",
  active: "تُحسب الأرقام من الطلبات النشطة (مؤكدة حتى تم الشحن).",
};

/**
 * `/partner/reports/sales` (backlog 5.6a, `ReportSales.dc.html`) — the reports platform's
 * representative/default family. Every number carries a period + comparison (rule 12).
 */

const PRESETS: { id: SalesReportPreset; label: string }[] = [
  { id: "today", label: "اليوم" },
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يومًا" },
  { id: "month", label: "هذا الشهر" },
  { id: "lastMonth", label: "الشهر الماضي" },
  { id: "custom", label: "مخصص" },
];

const BREAKDOWN_TABS: { id: keyof SalesReportResponse["breakdowns"]; label: string }[] = [
  { id: "byPartner", label: "حسب الشريك" },
  { id: "product", label: "حسب المنتج" },
  { id: "category", label: "حسب الفئة" },
  { id: "governorate", label: "حسب المحافظة" },
  { id: "payment", label: "حسب طريقة الدفع" },
  { id: "day", label: "حسب اليوم" },
];

async function fetchSalesReport(apiBase: string, params: URLSearchParams): Promise<SalesReportResponse> {
  const res = await fetch(`${apiBase}/sales?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "تعذر تحميل التقرير");
  return json.data;
}

/**
 * Backlog 9.4b (a): `apiBase` (default `/api/partner/reports`) and `switcher` (default the
 * partner's own `<ReportTabs/>`) let the admin's الأداء tab render this exact component
 * against `/api/admin/partners/<id>/reports` with an embedded, non-navigating switcher —
 * nothing here is copied. Neither prop is passed by `PartnerSalesReportPage`, so its
 * rendered DOM is unchanged.
 */
export function SalesReportView({
  apiBase = "/api/partner/reports",
  switcher,
  initialPreset = "30d",
  initialFrom = "",
  initialTo = "",
  initialBreakdownTab = "product",
}: {
  apiBase?: string;
  switcher?: React.ReactNode;
  /** Backlog 9.6 (d) — `/admin/analytics`'s redirect maps its old `?from&to` into these, so
   * an old bookmarked date range still lands on the same period. Defaults preserve the
   * pre-9.6 behaviour for every other caller. */
  initialPreset?: SalesReportPreset;
  initialFrom?: string;
  initialTo?: string;
  /** PM ruling (9.6 fix (d)) — "حسب الشريك first" on the admin network pages means first in
   * order *and* selected by default; the partner pages keep "product". Defaults to "product",
   * so every other caller's rendered DOM is unchanged. */
  initialBreakdownTab?: keyof SalesReportResponse["breakdowns"];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParamsHook = useSearchParams();

  const [preset, setPreset] = React.useState<SalesReportPreset>(initialPreset);
  const [customRange, setCustomRange] = React.useState({ from: initialFrom, to: initialTo });
  const [activeTab, setActiveTab] = React.useState<keyof SalesReportResponse["breakdowns"]>(initialBreakdownTab);
  const [page, setPage] = React.useState(1);
  // Backlog 10.13 — the accomplished/active order-set chip, kept in the URL like the preset:
  // seeded from `?orders=` on first render, and every toggle writes it back so it round-trips
  // through a reload/bookmark, on every route that renders this shared view.
  const [orderSet, setOrderSetState] = React.useState<SalesOrderSet>(() =>
    searchParamsHook.get("orders") === "active" ? "active" : "accomplished"
  );

  const setOrderSet = (next: SalesOrderSet) => {
    setOrderSetState(next);
    setPage(1);
    const nextParams = new URLSearchParams(searchParamsHook.toString());
    nextParams.set("orders", next);
    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const params = new URLSearchParams({ preset, page: String(page), orders: orderSet });
  if (preset === "custom" && customRange.from && customRange.to) {
    params.set("from", customRange.from);
    params.set("to", customRange.to);
  }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["partner-reports-sales", apiBase, preset, customRange.from, customRange.to, page, orderSet],
    queryFn: () => fetchSalesReport(apiBase, params),
    enabled: preset !== "custom" || Boolean(customRange.from && customRange.to),
  });

  const exportCsv = (breakdown: string) => {
    const p = new URLSearchParams({ preset, format: "csv", breakdown, orders: orderSet });
    if (preset === "custom" && customRange.from && customRange.to) {
      p.set("from", customRange.from);
      p.set("to", customRange.to);
    }
    window.open(`${apiBase}/sales?${p}`, "_blank");
  };

  // Backlog 10.14 — the «PDF» button, admin only (the network-wide `/admin/reports/*` pages
  // pass `apiBase="/api/admin/reports"`; every other caller, including the partner's own page
  // and the admin's per-partner الأداء tab, keeps its DOM unchanged).
  const isAdminReportsScope = apiBase === "/api/admin/reports";
  const openPrint = () => {
    const p = new URLSearchParams({ preset, orders: orderSet });
    if (preset === "custom" && customRange.from && customRange.to) {
      p.set("from", customRange.from);
      p.set("to", customRange.to);
    }
    window.open(`/admin/reports/sales/print?${p}`, "_blank", "noopener");
  };

  return (
    <div>
      <PartnerTopbarSlot>
        {switcher ?? <ReportTabs />}
      </PartnerTopbarSlot>

      <PageHeader title="تقرير المبيعات" description="التقارير · المبيعات" />

      <div className="flex flex-col gap-5">
        <PeriodBar
          presets={PRESETS}
          preset={preset}
          onPresetChange={(p) => {
            setPreset(p);
            setPage(1);
          }}
          from={customRange.from}
          to={customRange.to}
          onCustomRangeChange={setCustomRange}
          comparisonLabel={data?.comparisonLabel}
          scopeControl={
            <div role="group" aria-label="نطاق الطلبات" className="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-0.5">
              {ORDER_SET_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={orderSet === o.id}
                  onClick={() => setOrderSet(o.id)}
                  className={cn(
                    "inline-flex h-[26px] items-center rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
                    orderSet === o.id ? "bg-white text-lapis-800 shadow-soft" : "text-ink-soft hover:text-ink"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          }
          toolbar={
            <>
              {isAdminReportsScope && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={openPrint}>
                  <Printer className="h-3.5 w-3.5" />
                  PDF
                </Button>
              )}
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={() => exportCsv(activeTab)}>
                <Download className="h-3.5 w-3.5" />
                CSV
              </Button>
            </>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : isError || !data ? (
          <div role="alert" className="rounded-xl border border-carnelian-500/30 bg-danger-bg p-4 text-danger-text">
            <p className="text-sm font-bold">تعذر تحميل التقرير.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <>
            <HeadlineTiles headline={data.headline} higherIsBetter={{ cancellationRate: false }} />
            <p className="-mt-2 text-xs text-ink-soft">{ORDER_SET_EXPLAINER[orderSet]}</p>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <PanelCard title="الإيراد اليومي" description="الخط الباهت هو الفترة السابقة">
                {data.series[0] ? (
                  <TrendChart series={data.series[0]} unit="piastres" />
                ) : (
                  <p className="text-sm text-ink-soft">لا توجد بيانات.</p>
                )}
              </PanelCard>
              <PanelCard title="ما يستحق فعلًا" description="مستنتج من هذا التقرير">
                <ActionPanel actions={data.actions} />
              </PanelCard>
            </div>

            <PanelCard title="التفصيل" noPadding>
              <div className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:px-5">
                {BREAKDOWN_TABS.filter((t) => t.id !== "byPartner" || data.breakdowns.byPartner).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(t.id);
                      setPage(1);
                    }}
                    className={
                      "shrink-0 border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition-colors " +
                      (activeTab === t.id ? "border-gold-500 text-lapis-800" : "border-transparent text-ink-soft hover:text-ink")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className={isFetching ? "opacity-70" : undefined}>
                {activeTab === "byPartner" && data.breakdowns.byPartner && (
                  <BreakdownTable
                    page={data.breakdowns.byPartner}
                    columns={["الشريك", "الإيراد", "مقارنة بالفترة السابقة", "الطلبات", "نسبة الإلغاء"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.revenuePiastres} previous={r.previousRevenuePiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.orderCount)}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.cancellationRatePct.toFixed(1)}%</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "product" && (
                  <BreakdownTable
                    page={data.breakdowns.product}
                    columns={["المنتج", "القطع", "الإيراد", "مقارنة بالفترة السابقة", "حصة الإيراد"]}
                    rowKey={(r) => r.productId}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">
                          <ProductIdentity name={r.productName} identifier={r.productSlug} />
                        </TableCell>
                        <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.units)}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.revenuePiastres} previous={r.previousRevenuePiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.revenueSharePct.toFixed(0)}%</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "category" && (
                  <BreakdownTable
                    page={data.breakdowns.category}
                    columns={["الفئة", "القطع", "الإيراد", "مقارنة بالفترة السابقة", "الطلبات"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.units)}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.revenuePiastres} previous={r.previousRevenuePiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.orderCount)}</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "governorate" && (
                  <BreakdownTable
                    page={data.breakdowns.governorate}
                    columns={["المحافظة", "الإيراد", "مقارنة بالفترة السابقة", "الطلبات", "نسبة الإلغاء"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.revenuePiastres} previous={r.previousRevenuePiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.orderCount)}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.cancellationRatePct.toFixed(1)}%</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "payment" && (
                  <BreakdownTable
                    page={data.breakdowns.payment}
                    columns={["طريقة الدفع", "الإيراد", "مقارنة بالفترة السابقة", "الطلبات"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.revenuePiastres} previous={r.previousRevenuePiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.orderCount)}</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "day" && (
                  <BreakdownTable
                    page={data.breakdowns.day}
                    columns={["اليوم", "الإيراد", "الطلبات"]}
                    rowKey={(r) => r.date}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink" dir="ltr">{r.date}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.orderCount)}</TableCell>
                      </>
                    )}
                  />
                )}
              </div>
            </PanelCard>
          </>
        )}
      </div>
    </div>
  );
}
