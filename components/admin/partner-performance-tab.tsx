"use client";

import * as React from "react";
import { ReportTabs, type ReportFamilyId } from "@/components/partner/reports/report-tabs";
import { SalesReportView } from "@/components/partner/reports/sales-report-view";
import { FulfilmentReportView } from "@/components/partner/reports/fulfilment-report-view";
import { InventoryReportView } from "@/components/partner/reports/inventory-report-view";
import { MoneyReportView } from "@/components/partner/reports/money-report-view";
import { NetworkReportView } from "@/components/partner/reports/network-report-view";

/**
 * الأداء tab on the partner profile (backlog 9.4b) — this partner's own report pages (sales,
 * fulfilment, inventory, money — network only for agents), rendered by the exact same
 * `components/partner/reports/*`-backed views the partner sees, fed from
 * `GET /api/admin/partners/[id]/reports/<kind>` (B3: one handler module per report, shared
 * with the partner routes — `lib/reports/handlers/*`). The report switcher chips render into
 * the shared shell's topbar slot (`DashboardTopbarSlot`, the same portal the partner shell
 * uses) as buttons that flip local state instead of navigating, since this is one tab
 * (`?tab=performance`) rather than five routes.
 */
export function PartnerPerformanceTab({
  partnerId,
  partnerType,
}: {
  partnerId: string;
  partnerType: "AGENT" | "DISTRIBUTOR";
}) {
  const families = React.useMemo<ReportFamilyId[]>(
    () => (partnerType === "AGENT" ? ["sales", "fulfilment", "inventory", "network", "money"] : ["sales", "fulfilment", "inventory", "money"]),
    [partnerType]
  );
  const [report, setReport] = React.useState<ReportFamilyId>("sales");
  const active = families.includes(report) ? report : families[0];

  const apiBase = `/api/admin/partners/${partnerId}/reports`;
  const switcher = <ReportTabs activeId={active} onSelect={setReport} families={families} />;

  switch (active) {
    case "sales":
      return <SalesReportView apiBase={apiBase} switcher={switcher} />;
    case "fulfilment":
      return <FulfilmentReportView apiBase={apiBase} switcher={switcher} />;
    case "inventory":
      return <InventoryReportView apiBase={apiBase} switcher={switcher} settingsHref={`/admin/partners/${partnerId}?tab=settings`} />;
    case "network":
      return <NetworkReportView apiBase={apiBase} switcher={switcher} isAgentOverride />;
    case "money":
      return <MoneyReportView apiBase={apiBase} switcher={switcher} />;
    default:
      return null;
  }
}
