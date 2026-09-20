import type { Metadata } from "next";

// `partner/stock/intake/new/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30.
export const metadata: Metadata = { title: "الاستلام من المصنع · جديد" };

export default function PartnerStockIntakeNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
