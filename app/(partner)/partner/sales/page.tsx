import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { requireOutletPage } from "@/lib/sales/page-guard";

export const metadata = { title: "المبيعات" };

/** `/partner/sales` (backlog 11.3 placeholder): the sales log arrives in 11.4. */
export default async function SalesPage() {
  await requireOutletPage();
  return (
    <div>
      <PageHeader
        title="المبيعات"
        description="سجّل بيعاً جديداً من المنفذ."
        actions={
          <Button asChild>
            <Link href="/partner/sales/new">
              <Plus aria-hidden />
              بيع جديد
            </Link>
          </Button>
        }
      />
      <PanelCard title="سجل المبيعات">
        <p className="text-sm text-ink-soft">السجل قريباً</p>
      </PanelCard>
    </div>
  );
}
