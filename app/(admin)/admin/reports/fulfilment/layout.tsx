import type { Metadata } from "next";

// `admin/reports/fulfilment/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Label matches `ReportTabs`'s "fulfilment" chip.
export const metadata: Metadata = { title: "التجهيز" };

export default function AdminReportsFulfilmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
