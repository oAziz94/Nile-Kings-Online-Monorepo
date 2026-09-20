import type { Metadata } from "next";

// `admin/reports/money/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Label matches `ReportTabs`'s "money" chip.
export const metadata: Metadata = { title: "المال" };

export default function AdminReportsMoneyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
