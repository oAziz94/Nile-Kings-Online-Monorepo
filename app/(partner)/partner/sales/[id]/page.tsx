import { notFound } from "next/navigation";
import { SaleReceipt } from "@/components/partner/sales/sale-receipt";
import { getStoreSaleForPartner } from "@/lib/sales/get-sale";
import { requireOutletPage } from "@/lib/sales/page-guard";

export const metadata = { title: "إيصال" };

export default async function SaleReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOutletPage();
  const { id } = await params;
  const sale = await getStoreSaleForPartner(user.partnerId, id);
  if (!sale) notFound();
  return <SaleReceipt sale={sale} />;
}
