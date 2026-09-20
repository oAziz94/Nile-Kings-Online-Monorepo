import type { Metadata } from "next";

// `partner/stock/requests/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Label matches `StockTabs`'s "طلبات التوريد" tab.
export const metadata: Metadata = { title: "طلبات التوريد" };

export default function PartnerStockRequestsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
