"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerTopbarSlot } from "@/components/partner/partner-shell";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { PeriodBar } from "@/components/partner/reports/period-bar";
import { HeadlineTiles } from "@/components/partner/reports/headline-tiles";
import { BreakdownTable } from "@/components/partner/reports/breakdown-table";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import Link from "next/link";
import type { InventoryReportPreset } from "@/lib/analytics/partner-reports";
import type { InventoryReportResponse, InventoryReportFilter } from "@/lib/analytics/partner-inventory-report";

/** `/partner/reports/inventory` (backlog 5.6a, `ReportInventory.dc.html`). */

const PRESETS: { id: InventoryReportPreset; label: string }[] = [
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يومًا" },
  { id: "90d", label: "90 يومًا" },
  { id: "custom", label: "مخصص" },
];

const FILTERS: { id: InventoryReportFilter; label: string }[] = [
  { id: "needsReorder", label: "يحتاج طلبًا" },
  { id: "dead", label: "راكد" },
  { id: "all", label: "الكل" },
];

async function fetchInventoryReport(apiBase: string, params: URLSearchParams): Promise<InventoryReportResponse> {
  const res = await fetch(`${apiBase}/inventory?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "تعذر تحميل التقرير");
  return json.data;
}

/**
 * Backlog 9.4b (a): see `SalesReportView`'s doc comment for `apiBase`/`switcher`. The
 * "تعديل الأهداف" link to `/partner/settings` is a partner-only concept — `settingsHref`
 * lets the admin's الأداء tab point it at this partner's الإعدادات tab instead, or omit it.
 * Backlog 9.6 fix (b): `isNetworkScope` hides both reorder-CSV entry points (the topbar "CSV"
 * button and the sidebar "تصدير للمصنع" button) — `?export=reorder` has no single partner's
 * `lowStockThreshold` to build the factory-intake file against at network scope and answers
 * 400 — same special-casing pattern as `settingsHref`. Defaults to `false`.
 */
export function InventoryReportView({
  apiBase = "/api/partner/reports",
  switcher,
  settingsHref = "/partner/settings",
  isNetworkScope = false,
}: {
  apiBase?: string;
  switcher?: React.ReactNode;
  settingsHref?: string;
  isNetworkScope?: boolean;
}) {
  const [preset, setPreset] = React.useState<InventoryReportPreset>("30d");
  const [customRange, setCustomRange] = React.useState({ from: "", to: "" });
  const [filter, setFilter] = React.useState<InventoryReportFilter>("needsReorder");
  const [page, setPage] = React.useState(1);

  const params = new URLSearchParams({ preset, page: String(page), filter });
  if (preset === "custom" && customRange.from && customRange.to) {
    params.set("from", customRange.from);
    params.set("to", customRange.to);
  }

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["partner-reports-inventory", apiBase, preset, customRange.from, customRange.to, filter, page],
    queryFn: () => fetchInventoryReport(apiBase, params),
    enabled: preset !== "custom" || Boolean(customRange.from && customRange.to),
  });

  const exportReorderCsv = () => {
    const p = new URLSearchParams({ preset, export: "reorder" });
    if (preset === "custom" && customRange.from && customRange.to) {
      p.set("from", customRange.from);
      p.set("to", customRange.to);
    }
    window.open(`${apiBase}/inventory?${p}`, "_blank");
  };

  // Backlog 10.14 — see `SalesReportView`'s doc comment for the admin-only «PDF» button.
  const isAdminReportsScope = apiBase === "/api/admin/reports";
  const openPrint = () => {
    const p = new URLSearchParams({ preset });
    if (preset === "custom" && customRange.from && customRange.to) {
      p.set("from", customRange.from);
      p.set("to", customRange.to);
    }
    window.open(`/admin/reports/inventory/print?${p}`, "_blank", "noopener");
  };

  return (
    <div>
      <PartnerTopbarSlot>
        {switcher ?? <ReportTabs />}
      </PartnerTopbarSlot>

      <PageHeader title="تقرير المخزون" description="التقارير · المخزون" />

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
          comparisonLabel={
            data
              ? `سرعة البيع محسوبة على آخر ${data.period.days} يومًا · هدف التغطية ${data.settings.targetCoverDays} يومًا · الراكد = بلا بيع ${data.settings.deadStockDays} يومًا`
              : undefined
          }
          toolbar={
            <>
              <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs">
                <Link href={settingsHref}>
                  <Settings2 className="h-3.5 w-3.5" />
                  تعديل الأهداف
                </Link>
              </Button>
              {isAdminReportsScope && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={openPrint}>
                  <Printer className="h-3.5 w-3.5" />
                  PDF
                </Button>
              )}
              {!isNetworkScope && (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={exportReorderCsv}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              )}
            </>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 7 }).map((_, i) => (
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
            <HeadlineTiles
              headline={data.headline}
              higherIsBetter={{ deadStockCount: false, stockOutSkus: false, stockOutDays: false }}
            />

            {data.breakdowns.byPartner && (
              <PanelCard title="حسب الشريك" noPadding>
                <BreakdownTable
                  page={data.breakdowns.byPartner}
                  columns={["الشريك", "متوسط التغطية (يوم)", "راكدة", "نافدة", "قابل للبيع"]}
                  rowKey={(r) => r.key}
                  onPageChange={() => {}}
                  renderRow={(r) => (
                    <>
                      <TableCell className="font-semibold text-ink">{r.label}</TableCell>
                      <TableCell dir="ltr" className="text-ink">{r.medianCoverDays === null ? "∞" : formatNumberEn(Math.round(r.medianCoverDays))}</TableCell>
                      <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.deadStockSkus)}</TableCell>
                      <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.outOfStockSkus)}</TableCell>
                      <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.sellableUnits)}</TableCell>
                    </>
                  )}
                />
              </PanelCard>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <PanelCard title="حسب الصنف" description="مرتب حسب الأقرب للنفاد" noPadding>
                <div className="flex flex-wrap gap-1.5 border-b border-stone-200 px-4 py-2.5 sm:px-5">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFilter(f.id);
                        setPage(1);
                      }}
                      aria-pressed={filter === f.id}
                      className={
                        "inline-flex h-7 items-center rounded-full border px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 " +
                        (filter === f.id
                          ? "border-lapis-800 bg-lapis-800 text-white"
                          : "border-stone-200 bg-white text-ink hover:bg-stone-50")
                      }
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className={isFetching ? "opacity-70" : undefined}>
                  <BreakdownTable
                    page={data.breakdowns.sku}
                    columns={
                      data.breakdowns.byPartner
                        ? ["الشريك", "المنتج", "المقاس · اللون", "قابل للبيع", "يبيع/أسبوع", "تغطية (يوم)", "الحالة", "مقترح الطلب"]
                        : ["المنتج", "المقاس · اللون", "قابل للبيع", "يبيع/أسبوع", "تغطية (يوم)", "الحالة", "مقترح الطلب"]
                    }
                    rowKey={(r) => (r.partnerId ? `${r.partnerId}:${r.variantId}` : r.variantId)}
                    onPageChange={setPage}
                    renderRow={(r) => (
                      <>
                        {data.breakdowns.byPartner && <TableCell className="text-ink-soft">{r.partnerName}</TableCell>}
                        <TableCell className="font-semibold text-ink">
                          {r.productName}
                          <p className="font-mono text-[11px] font-normal text-ink-soft" dir="ltr">{r.sku}</p>
                        </TableCell>
                        <TableCell className="text-ink-soft">
                          {r.variantName}
                          {r.colorName ? ` · ${r.colorName}` : ""}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.sellable <= 0 ? "destructive" : "outline"}>
                            <span dir="ltr">{formatNumberEn(r.sellable)}</span>
                          </Badge>
                        </TableCell>
                        <TableCell dir="ltr" className="text-ink">{r.velocityPerWeek.toFixed(1)}</TableCell>
                        <TableCell dir="ltr" className="text-ink">{r.daysOfCover === null ? "∞" : formatNumberEn(Math.round(r.daysOfCover))}</TableCell>
                        <TableCell className="text-xs text-ink-soft">{r.isDead ? `راكد` : "—"}</TableCell>
                        <TableCell dir="ltr" className="font-extrabold text-lapis-800">{formatNumberEn(r.suggestedReorder)}</TableCell>
                      </>
                    )}
                  />
                  <p className="border-t border-stone-100 px-4 pb-3.5 text-[11px] text-ink-soft sm:px-5">
                    مقترح الطلب = هدف التغطية × سرعة البيع − القابل للبيع
                  </p>
                </div>
              </PanelCard>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 rounded-2xl bg-lapis-800 p-5 text-white shadow-soft">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-extrabold">قائمة إعادة الطلب</h2>
                    <Badge className="border-none bg-gold-500 text-[#12162b]">
                      {formatNumberEn(data.reorderList.itemCount)} صنفًا
                    </Badge>
                  </div>
                  <p className="text-xs leading-relaxed text-white/70">
                    مجهزة بصيغة ملف الاستلام من المصنع. أرسلها للمصنع كما هي، وعند وصول البضاعة استوردها كاستلام.
                  </p>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-white/70">إجمالي القطع</span>
                    <span dir="ltr" className="font-extrabold">{formatNumberEn(data.reorderList.totalUnits)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-white/70">التكلفة التقديرية</span>
                    <span dir="ltr" className="font-extrabold">{formatNumberEn(piastresToEgp(data.reorderList.estimatedCostPiastres))} ج.م</span>
                  </div>
                  {!isNetworkScope && (
                    <Button
                      type="button"
                      className="mt-1 gap-2 rounded-full bg-gold-500 text-[#12162b] hover:bg-gold-500/90"
                      onClick={exportReorderCsv}
                      disabled={data.reorderList.itemCount === 0}
                    >
                      <Download className="h-4 w-4" />
                      تصدير للمصنع
                    </Button>
                  )}
                </div>
                <PanelCard title="الراكد">
                  <p className="text-xs leading-relaxed text-ink-soft">
                    {formatNumberEn(data.headline.find((h) => h.key === "deadStockCount")?.value ?? 0)} صنفًا بلا بيع منذ{" "}
                    {data.settings.deadStockDays} يومًا أو أكثر — قيمتها بالتكلفة{" "}
                    <b dir="ltr">{formatNumberEn(piastresToEgp(data.deadStockValuePiastres))} ج.م</b>. ضعها في عرض أو حوّلها لموزع
                    يبيعها.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFilter("dead");
                      setPage(1);
                    }}
                    className="mt-2 text-xs font-bold text-lapis-800 hover:underline"
                  >
                    اعرض الأصناف الراكدة
                  </button>
                </PanelCard>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PartnerInventoryReportPage() {
  return <InventoryReportView />;
}
