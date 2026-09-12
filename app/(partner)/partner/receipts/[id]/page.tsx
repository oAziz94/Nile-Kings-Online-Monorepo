"use client";

/**
 * Partner — receipt detail (backlog 4.23). The printable record of one applied
 * `StockReceipt`: header (kind, reference, notes, date), the line list with the
 * previous → new stock per variant, and totals. AGENT only, ownership-checked server-side by
 * `GET /api/partner/receipts/[id]`.
 */
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Boxes, Printer, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, StatusBadge } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type ReceiptLine = {
  id: string;
  variantId: string;
  sku: string;
  product: string;
  variant: string;
  quantity: number;
  previousAvailable: number;
  newAvailable: number;
};

type ReceiptDetail = {
  id: string;
  kind: "FACTORY" | "COUNT";
  reference: string | null;
  notes: string | null;
  createdAt: string;
  partnerName: string;
  lines: ReceiptLine[];
  totalUnits: number;
};

async function fetchReceipt(id: string): Promise<ReceiptDetail> {
  const res = await fetch(`/api/partner/receipts/${id}`, { credentials: "include" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.message ?? "فشل تحميل الإيصال");
  }
  return json.data;
}

function RoleGatePanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-stone-200 bg-white py-14 text-center">
      <ShieldAlert className="h-9 w-9 text-stone-300" strokeWidth={1.5} />
      <p className="text-[15px] font-extrabold text-ink">{message}</p>
    </div>
  );
}

export default function PartnerReceiptDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: partner, isLoading: partnerLoading, isError: partnerError } = usePartnerMe();
  const isAgent = partner?.partnerType === "AGENT";

  const {
    data: receipt,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["partner-receipt", params.id],
    queryFn: () => fetchReceipt(params.id),
    enabled: isAgent,
  });

  if (partnerLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }
  if (partnerError) {
    return (
      <div role="alert" className="rounded-2xl border border-carnelian-500/30 bg-danger-bg p-6 text-danger-text">
        فشل تحميل بيانات الشريك
      </div>
    );
  }
  if (!isAgent) {
    return <RoleGatePanel message="هذه الصفحة متاحة للوكلاء فقط" />;
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/*
        Print stylesheet (backlog 4.23: "the receipt detail page is the printable record").
        `PartnerShell` (components/partner/partner-shell.tsx, out of this task's scope) has no
        dedicated print hook, so this targets its two chrome landmarks by tag — the sidebar
        `<aside>` and the mobile `<header>` — which are unique in that layout.
      */}
      <style jsx global>{`
        @media print {
          aside,
          header {
            display: none !important;
          }
          main {
            padding: 0 !important;
          }
          body {
            background: white !important;
          }
        }
      `}</style>

      <div className="print:hidden">
        <PageHeader
          title="إيصال المخزون"
          description="السجل الدائم لهذا الاستلام أو الجرد — قابل للطباعة."
          badge={<StatusBadge>وكلاء فقط</StatusBadge>}
          actions={
            <>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => router.push("/partner/receipts")}>
                <ArrowRight className="h-4 w-4" />
                رجوع للإيصالات
              </Button>
              {receipt && (
                <Button type="button" className="rounded-xl" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  طباعة
                </Button>
              )}
            </>
          }
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : isError || !receipt ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-2 rounded-[14px] border border-carnelian-500/30 bg-danger-bg py-14 text-center text-danger-text"
        >
          <AlertTriangle className="h-9 w-9" strokeWidth={1.5} />
          <p className="text-[15px] font-extrabold">
            {error instanceof Error ? error.message : "فشل تحميل الإيصال"}
          </p>
          <Button type="button" variant="outline" className="mt-2 rounded-xl" onClick={() => refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <PanelCard
          title={`إيصال #${receipt.id.slice(-8).toUpperCase()}`}
          icon={<Boxes className="h-5 w-5 text-lapis-800" />}
          noPadding
        >
          <div className="space-y-6 p-4 sm:p-[22px]">
            <dl className="grid grid-cols-2 gap-4 rounded-xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-ink-soft">النوع</dt>
                <dd className="font-bold text-ink">
                  {receipt.kind === "FACTORY" ? "استلام من المصنع" : "جرد فعلي"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">التاريخ</dt>
                <dd className="font-bold text-ink">{formatDateEn(receipt.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">المرجع</dt>
                <dd className="font-bold text-ink">{receipt.reference ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-soft">الوكيل</dt>
                <dd className="font-bold text-ink">{receipt.partnerName}</dd>
              </div>
              {receipt.notes && (
                <div className="col-span-2 sm:col-span-4">
                  <dt className="text-xs text-ink-soft">ملاحظات</dt>
                  <dd className="text-ink">{receipt.notes}</dd>
                </div>
              )}
            </dl>

            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full border-collapse text-right text-sm">
                <thead className="bg-stone-100">
                  <tr>
                    <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">SKU</th>
                    <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">المنتج</th>
                    <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">المتغير</th>
                    <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">
                      {receipt.kind === "FACTORY" ? "الكمية المستلمة" : "الجرد الفعلي"}
                    </th>
                    <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">قبل</th>
                    <th className="px-4 py-2 text-xs font-extrabold text-ink-soft">بعد</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.lines.map((line) => (
                    <tr key={line.id} className="border-t border-stone-200">
                      <td dir="ltr" className="px-4 py-2 text-right font-mono text-xs">
                        {line.sku}
                      </td>
                      <td className="px-4 py-2">{line.product}</td>
                      <td className="px-4 py-2">{line.variant}</td>
                      <td className="px-4 py-2 font-bold">{formatNumberEn(line.quantity)}</td>
                      <td className="px-4 py-2 text-ink-soft">{formatNumberEn(line.previousAvailable)}</td>
                      <td className="px-4 py-2 font-bold">{formatNumberEn(line.newAvailable)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={cn("border-t-2 border-stone-300 bg-stone-50 font-extrabold")}>
                    <td className="px-4 py-2" colSpan={3}>
                      الإجمالي
                    </td>
                    <td className="px-4 py-2">{formatNumberEn(receipt.totalUnits)}</td>
                    <td className="px-4 py-2" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </PanelCard>
      )}
    </div>
  );
}
