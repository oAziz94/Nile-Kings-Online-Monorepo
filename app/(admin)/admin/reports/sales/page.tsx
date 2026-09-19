"use client";

import { useSearchParams } from "next/navigation";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { SalesReportView } from "@/components/partner/reports/sales-report-view";

/**
 * `/admin/reports/sales` (backlog 9.6 (c)) — the network-wide sales report, rendered by the
 * exact same `SalesReportView` the partner and the admin's الأداء tab use (B2/B3), fed from
 * `GET /api/admin/reports/sales` with the `{ network: true }` scope. The switcher chips
 * navigate the admin's own `/admin/reports/*` routes (real pages, not a tab). `?preset=
 * custom&from&to` (from the old `/admin/analytics`'s redirect, 9.6 (d)) seeds the initial
 * period so an old bookmarked date range still lands on the same period.
 */
export default function AdminSalesReportPage() {
  const searchParams = useSearchParams();
  const preset = searchParams.get("preset");
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const seedCustom = preset === "custom" && from && to;

  return (
    <SalesReportView
      apiBase="/api/admin/reports"
      switcher={<ReportTabs basePath="/admin/reports" families={["sales", "fulfilment", "inventory", "money"]} />}
      initialBreakdownTab="byPartner"
      {...(seedCustom ? { initialPreset: "custom" as const, initialFrom: from, initialTo: to } : {})}
    />
  );
}
