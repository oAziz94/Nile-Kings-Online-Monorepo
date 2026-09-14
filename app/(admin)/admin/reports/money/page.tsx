"use client";

import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { MoneyReportView } from "@/app/(partner)/partner/reports/money/page";

/** `/admin/reports/money` (backlog 9.6 (c)) — see the sales page's sibling. */
export default function AdminMoneyReportPage() {
  return (
    <MoneyReportView
      apiBase="/api/admin/reports"
      switcher={<ReportTabs basePath="/admin/reports" families={["sales", "fulfilment", "inventory", "money"]} />}
    />
  );
}
