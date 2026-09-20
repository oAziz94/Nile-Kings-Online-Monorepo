import type { Metadata } from "next";

// `partner/reports/inventory/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Label matches `ReportTabs`'s "inventory" chip.
export const metadata: Metadata = { title: "المخزون" };

export default function PartnerReportsInventoryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
