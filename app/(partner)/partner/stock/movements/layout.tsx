import type { Metadata } from "next";

// `partner/stock/movements/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Label matches `StockTabs`'s "الحركات" tab.
export const metadata: Metadata = { title: "الحركات" };

export default function PartnerStockMovementsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
