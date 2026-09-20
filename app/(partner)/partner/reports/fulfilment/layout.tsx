import type { Metadata } from "next";

// `partner/reports/fulfilment/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Label matches `ReportTabs`'s "fulfilment" chip.
export const metadata: Metadata = { title: "التجهيز" };

export default function PartnerReportsFulfilmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
