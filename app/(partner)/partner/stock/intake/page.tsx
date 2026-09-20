import type { Metadata } from "next";
import { ReceiptsListTab } from "@/components/partner/stock/receipts-list";

export const metadata: Metadata = { title: "الاستلام من المصنع" };

export default function PartnerStockIntakeTab() {
  return <ReceiptsListTab kind="FACTORY" />;
}
