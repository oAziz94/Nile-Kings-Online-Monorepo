"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerTopbarSlot } from "@/components/partner/partner-shell";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { PeriodBar } from "@/components/partner/reports/period-bar";
import { HeadlineTiles } from "@/components/partner/reports/headline-tiles";
import { BreakdownTable } from "@/components/partner/reports/breakdown-table";
import { ActionPanel } from "@/components/partner/reports/action-panel";
import { DeltaCell } from "@/components/partner/reports/delta-cell";
import { formatNumberEn, formatDateEn } from "@/lib/format-en-numbers";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";
import type { FulfilmentReportResponse } from "@/lib/analytics/partner-fulfilment-report";

/**
 * `/partner/reports/fulfilment` (backlog 5.6b) — no dedicated artboard; reuses the sales
 * report's layout (`ReportSales.dc.html`) per the task brief.
 */

const PRESETS: { id: SalesReportPreset; label: string }[] = [
  { id: "today", label: "اليوم" },
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يومًا" },
  { id: "month", label: "هذا الشهر" },
  { id: "lastMonth", label: "الشهر الماضي" },
  { id: "custom", label: "مخصص" },
];

const BREAKDOWN_TABS: { id: keyof FulfilmentReportResponse["breakdowns"]; label: string }[] = [
  { id: "byPartner", label: "حسب الشريك" },
  { id: "slowest", label: "أبطأ الطلبات" },
  { id: "cancellationReason", label: "أسباب الإلغاء" },
];

async function fetchFulfilmentReport(apiBase: string, params: URLSearchParams): Promise<FulfilmentReportResponse> {
  const res = await fetch(`${apiBase}/fulfilment?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "تعذر تحميل التقرير");
  return json.data;
}

const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الإنشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

/** Backlog 9.4b (a): see `SalesReportView`'s doc comment for `apiBase`/`switcher`. Backlog
 * 9.6 fix (d): `initialBreakdownTab` — see `SalesReportView`'s doc comment. */
export function FulfilmentReportView({
  apiBase = "/api/partner/reports",
  switcher,
  initialBreakdownTab = "slowest",
}: {
  apiBase?: string;
  switcher?: React.ReactNode;
  initialBreakdownTab?: keyof FulfilmentReportResponse["breakdowns"];
}) {
  const [preset, setPreset] = React.useState<SalesReportPreset>("30d");
  const [customRange, setCustomRange] = React.useState({ from: "", to: "" });
  const [activeTab, setActiveTab] = React.useState<keyof FulfilmentReportResponse["breakdowns"]>(initialBreakdownTab);
  const [page, setPage] = React.useState(1);

  const params = new URLSearchParams({ preset, page: String(page) });
  if (preset === "custom" && customRange.from && customRange.to) {
    params.set("from", customRange.from);
    params.set("to", customRange.to);
  }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["partner-reports-fulfilment", apiBase, preset, customRange.from, customRange.to, page],
    queryFn: () => fetchFulfilmentReport(apiBase, params),
    enabled: preset !== "custom" || Boolean(customRange.from && customRange.to),
  });

  // Backlog 10.14 — see `SalesReportView`'s doc comment for the admin-only «PDF» button.
  const isAdminReportsScope = apiBase === "/api/admin/reports";
  const openPrint = () => {
    const p = new URLSearchParams({ preset });
    if (preset === "custom" && customRange.from && customRange.to) {
      p.set("from", customRange.from);
      p.set("to", customRange.to);
    }
    window.open(`/admin/reports/fulfilment/print?${p}`, "_blank", "noopener");
  };

  return (
    <div>
      <PartnerTopbarSlot>
        {switcher ?? <ReportTabs />}
      </PartnerTopbarSlot>

      <PageHeader title="تقرير التجهيز" description="التقارير · التجهيز" />

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
            isAdminReportsScope ? (
              <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={openPrint}>
                <Printer className="h-3.5 w-3.5" />
                PDF
              </Button>
            ) : undefined
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
            <button type="button" className="mt-2 text-sm font-bold text-lapis-800 underline" onClick={() => refetch()}>
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <>
            <HeadlineTiles
              headline={data.headline}
              higherIsBetter={{ overdueRate: false, cancellationRate: false, deliveredRate: true }}
            />

            {data.noAuditFootnote && (
              <p className="text-xs text-ink-soft">{data.noAuditFootnote}</p>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <PanelCard title="أبطأ 5 طلبات" description="مرتبة حسب مجموع الوقت المُلاحَظ (تأكيد + شحن)">
                {data.breakdowns.slowest.rows.length === 0 ? (
                  <p className="text-sm text-ink-soft">لا توجد طلبات بتوقيت مُلاحَظ في هذه الفترة.</p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {data.breakdowns.slowest.rows.slice(0, 5).map((r) => (
                      <li key={r.orderId} className="flex items-center justify-between gap-3 border-t border-stone-100 pt-2.5 text-sm first:border-t-0 first:pt-0">
                        <Link href={`/partner/orders/${r.orderId}`} className="font-bold text-lapis-800 hover:underline">
                          {r.orderId.slice(0, 8)}
                        </Link>
                        <span className="text-ink-soft">{STATUS_LABELS[r.status] ?? r.status}</span>
                        <span className="flex items-center gap-1 font-semibold text-ink">
                          {r.hoursToConfirm !== null && (
                            <span>
                              <span dir="ltr">{formatNumberEn(Number(r.hoursToConfirm.toFixed(1)))}</span>
                              س تأكيد
                            </span>
                          )}
                          {r.hoursToConfirm !== null && r.hoursToShip !== null && <span>·</span>}
                          {r.hoursToShip !== null && (
                            <span>
                              <span dir="ltr">{formatNumberEn(Number(r.hoursToShip.toFixed(1)))}</span>
                              س شحن
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
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
                    columns={["الشريك", "الطلبات", "نسبة المتأخر", "نسبة الإلغاء", "نسبة التسليم"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.totalOrders)}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.overdueRatePct.toFixed(1)}%</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.cancellationRatePct.toFixed(1)}%</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{r.deliveredRatePct.toFixed(1)}%</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "slowest" && (
                  <BreakdownTable
                    page={data.breakdowns.slowest}
                    columns={["الطلب", "الحالة", "التاريخ", "ساعات للتأكيد", "ساعات للشحن"]}
                    rowKey={(r) => r.orderId}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-lapis-800">
                          <Link href={`/partner/orders/${r.orderId}`} className="hover:underline">
                            {r.orderId.slice(0, 8)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-ink-soft">{STATUS_LABELS[r.status] ?? r.status}</TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatDateEn(r.createdAt.slice(0, 10))}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{r.hoursToConfirm === null ? "—" : formatNumberEn(Number(r.hoursToConfirm.toFixed(1)))}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{r.hoursToShip === null ? "—" : formatNumberEn(Number(r.hoursToShip.toFixed(1)))}</TableCell>
                      </>
                    )}
                  />
                )}
                {activeTab === "cancellationReason" && (
                  <BreakdownTable
                    page={data.breakdowns.cancellationReason}
                    columns={["السبب", "العدد", "مقارنة بالفترة السابقة"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.count)}</TableCell>
                        <TableCell><DeltaCell current={r.count} previous={r.previousCount} /></TableCell>
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

export default function PartnerFulfilmentReportPage() {
  return <FulfilmentReportView />;
}
