"use client";

import { SalesReportView } from "@/components/partner/reports/sales-report-view";
import { OutletSalesReportView } from "@/components/partner/reports/outlet-sales-report-view";
import { Skeleton } from "@/components/shared/skeleton";
import { usePartnerMe } from "@/hooks/use-partner-me";

/** Backlog 11.5 - an outlet reads counter receipts; every other partner keeps the agent report. */
export default function PartnerSalesReportPage() {
  const me = usePartnerMe();
  if (me.isLoading) return <Skeleton className="h-40 rounded-2xl" />;
  if (me.data?.partnerType === "DISTRIBUTOR") return <OutletSalesReportView />;
  return <SalesReportView />;
}
