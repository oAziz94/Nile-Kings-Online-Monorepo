import type { Metadata } from "next";

// `partner/reports/network/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Label matches `ReportTabs`'s "network" chip.
export const metadata: Metadata = { title: "الشبكة" };

export default function PartnerReportsNetworkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
