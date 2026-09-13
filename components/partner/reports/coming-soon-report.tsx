import { PageHeader } from "@/components/dashboard/page-header";
import { PartnerTopbarSlot } from "@/components/partner/partner-shell";
import { ReportTabs } from "@/components/partner/reports/report-tabs";
import { Clock } from "lucide-react";

/**
 * "قريبًا" panel for the report families 5.6b fills in (fulfilment/network/money) — reachable
 * from the switcher, per rule (16)'s "every screen" verification, rather than a 404.
 */
export function ComingSoonReport({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <PartnerTopbarSlot>
        <ReportTabs />
      </PartnerTopbarSlot>
      <PageHeader title={title} description={description} />
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white p-16 text-center shadow-soft">
        <Clock className="h-8 w-8 text-ink-soft" strokeWidth={1.5} />
        <p className="text-[15px] font-extrabold text-ink">قريبًا</p>
        <p className="max-w-sm text-sm text-ink-soft">هذا التقرير قيد الإنشاء وسيتوفر في تحديث لاحق.</p>
      </div>
    </div>
  );
}
