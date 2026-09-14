"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Download, Users as UsersIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerTopbarSlot } from "@/components/partner/partner-shell";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { PeriodBar } from "@/components/partner/reports/period-bar";
import { BreakdownTable } from "@/components/partner/reports/breakdown-table";
import { DeltaCell } from "@/components/partner/reports/delta-cell";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import type { MoneyReportPreset } from "@/lib/analytics/partner-reports";
import type { MoneyReportResponse } from "@/lib/analytics/partner-money-report";

/**
 * `/partner/reports/money` (backlog 5.6b, `Money.dc.html`) — two independent sides per
 * `05-partner-portal-v2.md` §1: the factory side (owed − paid, both cumulative snapshots)
 * and the cash side (collected/pending). The custom two-card layout follows the artboard
 * rather than the generic `HeadlineTiles` grid the other four reports use — the same
 * `ReportHeadline[]` shape still backs it (rule 12), just rendered to match this screen's
 * own design.
 */

const PRESETS: { id: MoneyReportPreset; label: string }[] = [
  { id: "month", label: "هذا الشهر" },
  { id: "lastMonth", label: "الشهر الماضي" },
  { id: "90d", label: "3 أشهر" },
  { id: "allTime", label: "منذ البداية" },
  { id: "custom", label: "مخصص" },
];

async function fetchMoneyReport(apiBase: string, params: URLSearchParams): Promise<MoneyReportResponse> {
  const res = await fetch(`${apiBase}/money?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "تعذر تحميل التقرير");
  return json.data;
}

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

function byKey(data: MoneyReportResponse) {
  return Object.fromEntries(data.headline.map((h) => [h.key, h]));
}

/** Small bar chart for "التحصيل الأسبوعي" — a bar-per-week rendering (the artboard's own
 * chart shape), separate from `TrendChart` which is a single-hue line-only component. */
function WeeklyBarChart({ points }: { points: { weekStart: string; amountPiastres: number }[] }) {
  if (points.length === 0) {
    return <p className="p-4 text-sm text-ink-soft">لا توجد بيانات تحصيل في هذه الفترة.</p>;
  }
  const max = Math.max(1, ...points.map((p) => p.amountPiastres));
  return (
    <div className="flex items-end gap-2 px-4 pb-4 pt-2" style={{ direction: "ltr", height: 160 }}>
      {points.map((p) => (
        <div key={p.weekStart} className="flex flex-1 flex-col items-center gap-1.5">
          <span dir="ltr" className="text-[10px] font-bold text-ink">
            {formatNumberEn(piastresToEgp(p.amountPiastres))}
          </span>
          <div
            className="w-full max-w-[44px] rounded-t-md bg-lapis-800"
            style={{ height: `${Math.max(4, (p.amountPiastres / max) * 100)}px` }}
          />
          <span className="text-[10px] text-ink-soft">{formatDateEn(p.weekStart)}</span>
        </div>
      ))}
    </div>
  );
}

/** Backlog 9.4b (a): see `SalesReportView`'s doc comment for `apiBase`/`switcher`. */
export function MoneyReportView({
  apiBase = "/api/partner/reports",
  switcher,
}: {
  apiBase?: string;
  switcher?: React.ReactNode;
}) {
  const [preset, setPresetState] = React.useState<MoneyReportPreset>("month");
  const [customRange, setCustomRangeState] = React.useState({ from: "", to: "" });
  const [page, setPage] = React.useState(1);
  const setPreset = React.useCallback((next: MoneyReportPreset) => {
    setPresetState(next);
    setPage(1);
  }, []);
  const setCustomRange = React.useCallback((next: { from: string; to: string }) => {
    setCustomRangeState(next);
    setPage(1);
  }, []);

  const params = new URLSearchParams({ preset, page: String(page) });
  if (preset === "custom" && customRange.from && customRange.to) {
    params.set("from", customRange.from);
    params.set("to", customRange.to);
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["partner-reports-money", apiBase, preset, customRange.from, customRange.to, page],
    queryFn: () => fetchMoneyReport(apiBase, params),
    enabled: preset !== "custom" || Boolean(customRange.from && customRange.to),
  });

  const exportStatement = () => {
    window.open(`${apiBase}/money?export=statement`, "_blank");
  };

  return (
    <div>
      <PartnerTopbarSlot>
        {switcher ?? <ReportTabs />}
      </PartnerTopbarSlot>

      <PageHeader title="المال" description="التقارير · المال" />

      <div className="flex flex-col gap-5">
        <PeriodBar
          presets={PRESETS}
          preset={preset}
          onPresetChange={setPreset}
          from={customRange.from}
          to={customRange.to}
          onCustomRangeChange={setCustomRange}
          comparisonLabel={data?.comparisonLabel}
          toolbar={
            <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={exportStatement}>
              <Download className="h-3.5 w-3.5" />
              كشف حساب
            </Button>
          }
        />

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-64 rounded-2xl" />
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : isError || !data ? (
          <div role="alert" className="rounded-xl border border-carnelian-500/30 bg-danger-bg p-4 text-danger-text">
            <p className="text-sm font-bold">تعذر تحميل التقرير.</p>
            <button type="button" className="mt-2 text-sm font-bold text-lapis-800 underline" onClick={() => refetch()}>
              إعادة المحاولة
            </button>
          </div>
        ) : (
          (() => {
            const h = byKey(data);
            return (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Factory side */}
                  <div className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-[15px] font-extrabold text-ink">حسابك مع المصنع</h2>
                        <p className="mt-1 text-xs text-ink-soft">
                          تشتري البضاعة بنسبتك ({data.costRatePct}% من سعر البيع) عند الاستلام · تحددها الإدارة
                        </p>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
                        <Banknote className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-soft">قيمة البضاعة المستلمة</span>
                      <span dir="ltr" className="font-bold text-ink">{egp(h.receivedAllTime.value)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-soft">دفعاتك المقدمة وأقساطك</span>
                      <span dir="ltr" className="font-bold text-ink">− {egp(h.paidAllTime.value)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-stone-200 pt-3">
                      <span className="text-sm font-extrabold text-ink">المتبقي عليك</span>
                      <span dir="ltr" className="text-2xl font-extrabold text-danger-text">{egp(h.balance.value)}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-ink-soft">{h.balance.hint}</p>
                  </div>

                  {/* Cash side */}
                  <div className="flex flex-col gap-3.5 rounded-2xl bg-white p-5 shadow-soft">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-[15px] font-extrabold text-ink">نقدك من العملاء</h2>
                        <p className="mt-1 text-xs text-ink-soft">أنت من يحصّل ثمن ما تبيعه</p>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
                        <UsersIcon className="h-5 w-5" />
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-soft">محصّل خلال الفترة</span>
                      <span dir="ltr" className="font-bold text-ink">{egp(h.collectedInPeriod.value)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="text-ink-soft">بانتظار التحصيل (مشحون ولم يُسلَّم)</span>
                      <span dir="ltr" className="font-bold text-gold-600">{egp(h.codPendingNow.value)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-stone-200 pt-3">
                      <span className="text-sm font-extrabold text-ink">هامشك التقديري</span>
                      <span dir="ltr" className="text-2xl font-extrabold text-malachite-text">{egp(h.marginEstimate.value)}</span>
                    </div>
                    <p className="text-xs leading-relaxed text-ink-soft">{h.marginEstimate.hint}</p>
                  </div>
                </div>

                {data.breakdowns.byPartner && (
                  <PanelCard title="حسب الشريك" noPadding>
                    <BreakdownTable
                      page={data.breakdowns.byPartner}
                      columns={["الشريك", "المتبقي عليه", "دفعاته وأقساطه", "المستلم منذ البداية"]}
                      rowKey={(r) => r.key}
                      onPageChange={() => {}}
                      renderRow={(r) => (
                        <>
                          <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                          <TableCell dir="ltr" className="font-bold text-danger-text">{egp(r.owedPiastres)}</TableCell>
                          <TableCell dir="ltr" className="text-ink-soft">{egp(r.paidAllTimePiastres)}</TableCell>
                          <TableCell dir="ltr" className="text-ink-soft">{egp(r.receivedAllTimePiastres)}</TableCell>
                        </>
                      )}
                    />
                  </PanelCard>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <PanelCard title="استلامات المصنع" noPadding>
                    <BreakdownTable
                      page={data.breakdowns.receipts}
                      columns={["المرجع", "التاريخ", "القطع", "القيمة بنسبتك"]}
                      rowKey={(r) => r.id}
                      onPageChange={setPage}
                      renderRow={(r) => (
                        <>
                          <TableCell className="font-semibold text-ink">{r.reference ?? "—"}</TableCell>
                          <TableCell dir="ltr" className="text-ink-soft">{formatDateEn(r.createdAt.slice(0, 10))}</TableCell>
                          <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.units)}</TableCell>
                          <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.totalCostPiastres))}</TableCell>
                        </>
                      )}
                    />
                  </PanelCard>

                  <div className="flex flex-col gap-4">
                    <PanelCard title="الدفعات المقدمة والأقساط" noPadding>
                      <BreakdownTable
                        page={data.breakdowns.payments}
                        columns={["التاريخ", "المبلغ", "المرجع"]}
                        rowKey={(r) => r.id}
                        onPageChange={setPage}
                        renderRow={(r) => (
                          <>
                            <TableCell dir="ltr" className="text-ink-soft">{formatDateEn(r.paidAt.slice(0, 10))}</TableCell>
                            <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.amountPiastres))}</TableCell>
                            <TableCell className="text-ink-soft">
                              {r.kind === "DOWN_PAYMENT" ? "دفعة مقدمة" : "قسط"}
                              {r.reference ? ` · ${r.reference}` : r.stockReceiptReference ? ` · ${r.stockReceiptReference}` : ""}
                            </TableCell>
                          </>
                        )}
                      />
                    </PanelCard>

                    <PanelCard title="التحصيل الأسبوعي" noPadding>
                      <WeeklyBarChart points={data.collectedByWeek} />
                    </PanelCard>
                  </div>
                </div>

                <PanelCard title="التحصيل حسب طريقة الدفع" noPadding>
                  <BreakdownTable
                    page={data.breakdowns.collectedByMethod}
                    columns={["الطريقة", "المبلغ", "مقارنة بالفترة السابقة", "الطلبات"]}
                    rowKey={(r) => r.key}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                        <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.amountPiastres))}</TableCell>
                        <TableCell><DeltaCell current={r.amountPiastres} previous={r.previousPiastres} /></TableCell>
                        <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.orderCount)}</TableCell>
                      </>
                    )}
                  />
                </PanelCard>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

export default function PartnerMoneyReportPage() {
  return <MoneyReportView />;
}
