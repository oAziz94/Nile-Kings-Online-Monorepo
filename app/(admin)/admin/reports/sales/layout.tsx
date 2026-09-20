import type { Metadata } from "next";

// `admin/reports/sales/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Label matches `ReportTabs`'s "sales" chip.
export const metadata: Metadata = { title: "المبيعات" };

export default function AdminReportsSalesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
