"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
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
import { BarList } from "@/components/partner/reports/bar-list";
import { ActionPanel } from "@/components/partner/reports/action-panel";
import { DeltaCell } from "@/components/partner/reports/delta-cell";
import { ProductIdentity } from "@/components/dashboard/product-identity";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";
import type { OutletSalesBreakdownKey, OutletSalesReportResponse } from "@/lib/analytics/outlet-sales-report";

/**
 * `/partner/reports/sales` for an outlet (backlog 11.5). Same period bar / headline tiles /
 * trend chart / breakdown table as the agent report; the data is counter receipts. Every
 * number carries the period and the previous-period comparison (rule 12). Sizes, colours and
 * hours are ranked bar lists (one hue, direct labels) with the same figures in the tabs below
 * as a table.
 */
const PRESETS: { id: SalesReportPreset; label: string }[] = [
  { id: "today", label: "اليوم" },
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يومًا" },
  { id: "month", label: "هذا الشهر" },
  { id: "lastMonth", label: "الشهر الماضي" },
  { id: "custom", label: "مخصص" },
];

const BREAKDOWN_TABS: { id: OutletSalesBreakdownKey; label: string }[] = [
  { id: "product", label: "حسب المنتج" },
  { id: "payment", label: "حسب طريقة الدفع" },
  { id: "size", label: "حسب المقاس" },
  { id: "colour", label: "حسب اللون" },
  { id: "day", label: "حسب اليوم" },
  { id: "hour", label: "حسب الساعة" },
];

const egp = (piastres: number) => `${formatNumberEn(piastresToEgp(piastres))} ج.م`;

async function fetchReport(params: URLSearchParams): Promise<OutletSalesReportResponse> {
  const res = await fetch(`/api/partner/reports/sales?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "تعذر تحميل التقرير");
  return json.data;
}

export function OutletSalesReportView() {
  const [preset, setPreset] = React.useState<SalesReportPreset>("30d");
  const [customRange, setCustomRange] = React.useState({ from: "", to: "" });
  const [activeTab, setActiveTab] = React.useState<OutletSalesBreakdownKey>("product");
  const [page, setPage] = React.useState(1);

  const rangeParams = (p: URLSearchParams) => {
    if (preset === "custom" && customRange.from && customRange.to) {
      p.set("from", customRange.from);
      p.set("to", customRange.to);
    }
    return p;
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["outlet-reports-sales", preset, customRange.from, customRange.to, page],
    queryFn: () => fetchReport(rangeParams(new URLSearchParams({ preset, page: String(page) }))),
    enabled: preset !== "custom" || Boolean(customRange.from && customRange.to),
  });

  const exportCsv = () => {
    window.open(`/api/partner/reports/sales?${rangeParams(new URLSearchParams({ preset, format: "csv", breakdown: activeTab }))}`, "_blank");
  };

  return (
    <div>
      <PartnerTopbarSlot>
        <ReportTabs />
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
          toolbar={
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={exportCsv}>
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
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
            <HeadlineTiles headline={data.headline} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <PanelCard title="الإيراد اليومي" description="الخط الباهت هو الفترة السابقة">
                {data.series[0] ? <TrendChart series={data.series[0]} unit="piastres" /> : <p className="text-sm text-ink-soft">لا توجد بيانات.</p>}
              </PanelCard>
              <PanelCard title="ما يستحق فعلًا" description="مستنتج من هذا التقرير">
                <ActionPanel actions={data.actions} />
              </PanelCard>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <PanelCard title="أكثر المقاسات مبيعًا" description="بالقطع">
                <BarList
                  ariaLabel="أكثر المقاسات مبيعًا"
                  rows={data.breakdowns.size.rows.slice(0, 6).map((r) => ({ key: r.key, label: r.label, value: r.units, valueText: formatNumberEn(r.units) }))}
                />
              </PanelCard>
              <PanelCard title="أكثر الألوان مبيعًا" description="بالقطع">
                <BarList
                  ariaLabel="أكثر الألوان مبيعًا"
                  rows={data.breakdowns.colour.rows.slice(0, 6).map((r) => ({ key: r.key, label: r.label, value: r.units, valueText: formatNumberEn(r.units) }))}
                />
              </PanelCard>
              <PanelCard title="أفضل ساعات البيع" description="بالإيراد">
                <BarList
                  ariaLabel="أفضل ساعات البيع"
                  rows={data.breakdowns.hour.rows.slice(0, 6).map((r) => ({
                    key: String(r.hour),
                    label: r.label,
                    value: r.revenuePiastres,
                    valueText: egp(r.revenuePiastres),
                    detail: `${formatNumberEn(r.receiptCount)} إيصال`,
                  }))}
                />
              </PanelCard>
            </div>

            <PanelCard title="التفصيل" description="الأرقام نفسها في شكل جدول" noPadding>
              <div className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:px-5">
                {BREAKDOWN_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={activeTab === t.id}
                    onClick={() => {
                      setActiveTab(t.id);
                      setPage(1);
                    }}
                    className={
                      "shrink-0 border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 " +
                      (activeTab === t.id ? "border-gold-500 text-lapis-800" : "border-transparent text-ink-soft hover:text-ink")
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className={isFetching ? "opacity-70" : undefined} data-testid={`outlet-breakdown-${activeTab}`}>
                {activeTab === "product" && (
                  <BreakdownTable
                    page={data.breakdowns.product}
                    columns={["المنتج", "القطع", "الإيراد", "مقارنة بالفترة السابقة", "حصة الإيراد"]}
                    rowKey={(r) => r.productId}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink" data-testid="product-row">
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
                {activeTab === "payment" && (
                  <BreakdownTable
                    page={data.breakdowns.payment}
                    columns={["طريقة الدفع", "الإيراد", "مقارنة بالفترة السابقة", "الإيصالات", "حصة الإيراد"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.revenuePiastres} previous={r.previousRevenuePiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.receiptCount)}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.revenueSharePct.toFixed(0)}%</TableCell>
                      </>
                    )}
                  />
                )}
                {(activeTab === "size" || activeTab === "colour") && (
                  <BreakdownTable
                    page={data.breakdowns[activeTab]}
                    columns={[activeTab === "size" ? "المقاس" : "اللون", "القطع", "الإيراد", "حصة الإيراد"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.units)}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.revenueSharePct.toFixed(0)}%</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "day" && (
                  <BreakdownTable
                    page={data.breakdowns.day}
                    columns={["اليوم", "الإيراد", "الإيصالات", "القطع"]}
                    rowKey={(r) => r.date}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink" dir="ltr">{r.date}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.receiptCount)}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.units)}</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "hour" && (
                  <BreakdownTable
                    page={data.breakdowns.hour}
                    columns={["الساعة", "الإيراد", "الإيصالات"]}
                    rowKey={(r) => String(r.hour)}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink" dir="ltr">{r.label}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.revenuePiastres))}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.receiptCount)}</TableCell>
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
