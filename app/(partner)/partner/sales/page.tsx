import { SalesLog } from "@/components/partner/sales/sales-log";
import { requireOutletPage } from "@/lib/sales/page-guard";

export const metadata = { title: "المبيعات" };

/** `/partner/sales` (backlog 11.4): the outlet's sales log. */
export default async function SalesPage() {
  await requireOutletPage();
  return <SalesLog />;
}
