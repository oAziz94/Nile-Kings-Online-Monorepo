import { PageHeader } from "@/components/dashboard/page-header";
import { CounterScreen } from "@/components/partner/sales/counter-screen";
import { requireOutletPage } from "@/lib/sales/page-guard";

export const metadata = { title: "بيع جديد" };

export default async function NewSalePage() {
  await requireOutletPage();
  return (
    <div>
      <PageHeader title="بيع جديد" description="ابحث عن الصنف، أضفه للسلة ثم أكّد البيع." />
      <CounterScreen />
    </div>
  );
}
