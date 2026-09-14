"use client";

import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { InventoryReportView } from "@/app/(partner)/partner/reports/inventory/page";

/** `/admin/reports/inventory` (backlog 9.6 (c)) — see the sales page's sibling. No
 * "تعديل الأهداف" link at network scope (settings are per-partner). */
export default function AdminInventoryReportPage() {
  return (
    <InventoryReportView
      apiBase="/api/admin/reports"
      switcher={<ReportTabs basePath="/admin/reports" families={["sales", "fulfilment", "inventory", "money"]} />}
      settingsHref="/admin/partners"
    />
  );
}
