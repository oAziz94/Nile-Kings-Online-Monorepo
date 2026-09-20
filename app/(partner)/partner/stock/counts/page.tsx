import type { Metadata } from "next";
import { ReceiptsListTab } from "@/components/partner/stock/receipts-list";

export const metadata: Metadata = { title: "الجرد" };

export default function PartnerStockCountsTab() {
  return <ReceiptsListTab kind="COUNT" />;
}
