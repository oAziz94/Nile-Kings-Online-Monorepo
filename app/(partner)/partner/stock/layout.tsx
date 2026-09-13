"use client";

import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { StockTabs } from "@/components/partner/stock/stock-tabs";

/**
 * المخزون hub shell (backlog 5.4, `Stock.dc.html`): one page header + tab bar wrapping the
 * five tab routes (`/partner/stock`, `.../movements`, `.../intake`, `.../counts`,
 * `.../requests`). Each tab is its own route/page — this layout only supplies the shared
 * chrome around them.
 *
 * `/partner/stock/products/[id]` (the per-product variant editor drilled into from the
 * index tab's "تعديل المخزون" row action) is not one of the five tabs — it renders full
 * width without the tab bar, same as the old `/partner/products/[id]` page did.
 */
export default function PartnerStockLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isProductDrillIn = pathname?.startsWith("/partner/stock/products/");

  if (isProductDrillIn) return <>{children}</>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="المخزون"
        description="كل ما يخص مخزونك في مكان واحد: المتاح، الحركات، الاستلام من المصنع، الجرد، وطلبات التوريد."
      />
      <div className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <StockTabs />
        <div className="p-4 sm:p-[22px]">{children}</div>
      </div>
    </div>
  );
}
