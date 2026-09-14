"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { PartnerTopbarSlot } from "@/components/partner/partner-shell";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { PeriodBar } from "@/components/partner/reports/period-bar";
import { HeadlineTiles } from "@/components/partner/reports/headline-tiles";
import { BreakdownTable } from "@/components/partner/reports/breakdown-table";
import { ActionPanel } from "@/components/partner/reports/action-panel";
import { DeltaCell } from "@/components/partner/reports/delta-cell";
import { PartnerRoleGatePanel } from "@/components/partner/role-gate-panel";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";
import type { NetworkReportResponse } from "@/lib/analytics/partner-network-report";

/**
 * `/partner/reports/network` (backlog 5.6b, AGENT only) — no dedicated artboard; reuses the
 * sales report's layout. Distributor callers get the explicit role-gate panel (rule: "a
 * wrong-role visit renders an explicit panel, not an empty table"), same as `/partner/network`.
 */

const PRESETS: { id: SalesReportPreset; label: string }[] = [
  { id: "today", label: "اليوم" },
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يومًا" },
  { id: "month", label: "هذا الشهر" },
  { id: "lastMonth", label: "الشهر الماضي" },
  { id: "custom", label: "مخصص" },
];

async function fetchNetworkReport(apiBase: string, params: URLSearchParams): Promise<NetworkReportResponse> {
  const res = await fetch(`${apiBase}/network?${params}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.data) throw new Error(json?.error?.message ?? "تعذر تحميل التقرير");
  return json.data;
}

/**
 * Backlog 9.4b (a): see `SalesReportView`'s doc comment for `apiBase`/`switcher`. The admin's
 * الأداء tab already knows the viewed partner's type from the profile it's rendering, so it
 * passes `isAgentOverride` and this view skips its own `usePartnerMe()` role check (which
 * would otherwise fire a doomed `/api/partner/me` fetch against an admin session).
 */
export function NetworkReportView({
  apiBase = "/api/partner/reports",
  switcher,
  isAgentOverride,
}: {
  apiBase?: string;
  switcher?: React.ReactNode;
  isAgentOverride?: boolean;
}) {
  const { data: me, isLoading: meLoadingRaw } = usePartnerMe({ enabled: isAgentOverride === undefined });
  const isAgent = isAgentOverride ?? me?.partnerType === "AGENT";
  const meLoading = isAgentOverride === undefined && meLoadingRaw;

  const [preset, setPreset] = React.useState<SalesReportPreset>("30d");
  const [customRange, setCustomRange] = React.useState({ from: "", to: "" });
  const [page, setPage] = React.useState(1);

  const params = new URLSearchParams({ preset, page: String(page) });
  if (preset === "custom" && customRange.from && customRange.to) {
    params.set("from", customRange.from);
    params.set("to", customRange.to);
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["partner-reports-network", apiBase, preset, customRange.from, customRange.to, page],
    queryFn: () => fetchNetworkReport(apiBase, params),
    enabled: isAgent && (preset !== "custom" || Boolean(customRange.from && customRange.to)),
  });

  return (
    <div>
      <PartnerTopbarSlot>
        {switcher ?? <ReportTabs />}
      </PartnerTopbarSlot>

      <PageHeader title="تقرير الشبكة" description="التقارير · الشبكة" />

      {meLoading ? (
        <Skeleton className="h-28 rounded-2xl" />
      ) : !isAgent ? (
        <PartnerRoleGatePanel allowedRole="AGENT" />
      ) : (
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
          />

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
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
              <HeadlineTiles headline={data.headline} />

              <PanelCard title="ما يستحق فعلًا" description="مستنتج من هذا التقرير">
                <ActionPanel actions={data.actions} />
              </PanelCard>

              <PanelCard title="الموزعون" noPadding>
                <BreakdownTable
                  page={data.breakdowns.distributor}
                  columns={["الموزع", "المبيعات", "مقارنة بالفترة السابقة", "قابل للبيع", "طلبات معلقة", "معدّل التنفيذ", "قطع محوّلة"]}
                  rowKey={(r) => r.partnerId}
                  onPageChange={setPage}
                  renderRow={(r) => (
                    <>
                      <TableCell className="font-semibold text-ink">
                        <div className="flex items-center gap-2">
                          {apiBase === "/api/partner/reports" ? (
                            <Link href="/partner/network" className="hover:underline">
                              {r.name}
                            </Link>
                          ) : (
                            <span>{r.name}</span>
                          )}
                          {!r.isActive && <Badge variant="secondary">غير نشط</Badge>}
                        </div>
                      </TableCell>
                      <TableCell dir="ltr" className="font-bold text-ink">{formatNumberEn(piastresToEgp(r.salesPiastres))}</TableCell>
                      <TableCell><DeltaCell current={r.salesPiastres} previous={r.previousSalesPiastres} /></TableCell>
                      <TableCell dir="ltr" className="text-ink">{formatNumberEn(r.sellable)}</TableCell>
                      <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.pendingRequests)}</TableCell>
                      <TableCell dir="ltr" className="text-ink-soft">{r.fillRatePct === null ? "—" : `${Math.round(r.fillRatePct)}%`}</TableCell>
                      <TableCell dir="ltr" className="text-ink-soft">{formatNumberEn(r.unitsTransferred)}</TableCell>
                    </>
                  )}
                />
              </PanelCard>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function PartnerNetworkReportPage() {
  return <NetworkReportView />;
}
