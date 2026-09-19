"use client";

import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { FulfilmentReportView } from "@/components/partner/reports/fulfilment-report-view";

/** `/admin/reports/fulfilment` (backlog 9.6 (c)) — see the sales page's sibling. */
export default function AdminFulfilmentReportPage() {
  return (
    <FulfilmentReportView
      apiBase="/api/admin/reports"
      switcher={<ReportTabs basePath="/admin/reports" families={["sales", "fulfilment", "inventory", "money"]} />}
      initialBreakdownTab="byPartner"
    />
  );
}
