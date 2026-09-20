import type { Metadata } from "next";
import { StockLayoutClient } from "@/components/partner/stock/stock-layout-client";

// `partner/stock/page.tsx` (the index tab) is a client component and cannot export
// metadata itself — backlog 10.30. The chrome (tab bar, page header) still needs
// `usePathname`, so it moved to `StockLayoutClient`; this file is now a server component
// solely so it can carry `metadata`. Nested routes (`movements`, `intake`, `counts`,
// `requests`, `products/[id]`) each override this with their own title. `title.template` is
// repeated (identical to `app/(partner)/partner/layout.tsx`'s) so it still reaches those
// children's titles instead of stopping at a plain string here (Next.js only carries a
// `title.template` one layout deep).
export const metadata: Metadata = {
  title: { default: "المخزون", template: "%s · لوحة الشريك" },
};

export default function PartnerStockLayout({ children }: { children: React.ReactNode }) {
  return <StockLayoutClient>{children}</StockLayoutClient>;
}
