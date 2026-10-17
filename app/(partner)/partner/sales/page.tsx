import { ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";

/** Placeholder until backlog 11.3 (counter screen + sales) replaces this file. */
export default function PartnerSalesPlaceholderPage() {
  return (
    <div>
      <PageHeader title="المبيعات" description="تسجيل البيع من المنفذ وإيصالاته." />
      <div className="flex flex-col items-center justify-center gap-3 rounded-[14px] border border-stone-200 bg-white px-6 py-16 text-center">
        <ReceiptText className="h-10 w-10 text-stone-300" strokeWidth={1.5} />
        <p className="text-base font-extrabold text-ink">قريباً</p>
      </div>
    </div>
  );
}
