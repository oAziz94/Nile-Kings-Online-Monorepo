import { AlertTriangle } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * "قائمة التجهيز" bulk print (backlog 9.3 b) — the admin equivalent of the partner's
 * `/partner/orders/pick-list` (`app/(partner)/partner/orders/pick-list/page.tsx`), but
 * grouped by SKU across every selected order (any partner) instead of one section per
 * order, per the task's "print view of the selected orders' items grouped by SKU".
 */
export default async function AdminPickingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const raw = params.ids;
  const ids = (Array.isArray(raw) ? raw.join(",") : raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-ink-soft">
        لم يتم تحديد أي طلبات للطباعة.
      </div>
    );
  }

  const orders = await prisma.order.findMany({
    where: { id: { in: ids } },
    include: {
      items: { select: { productName: true, variantName: true, sku: true, quantity: true } },
    },
  });

  if (orders.length !== ids.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-danger-text/30 bg-danger-bg p-8 text-danger-text">
        <p className="flex items-center gap-2 text-sm font-extrabold">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          تعذر التحميل
        </p>
        <p className="mt-2 text-sm">أحد الطلبات المحددة غير موجود.</p>
      </div>
    );
  }

  const bySku = new Map<
    string,
    { sku: string; productName: string; variantName: string; quantity: number; orderNumbers: Set<string> }
  >();
  for (const order of orders) {
    for (const item of order.items) {
      const existing = bySku.get(item.sku);
      if (existing) {
        existing.quantity += item.quantity;
        existing.orderNumbers.add(order.id.slice(0, 8));
      } else {
        bySku.set(item.sku, {
          sku: item.sku,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          orderNumbers: new Set([order.id.slice(0, 8)]),
        });
      }
    }
  }
  const rows = Array.from(bySku.values()).sort((a, b) => a.sku.localeCompare(b.sku));

  return (
    <div className="mx-auto max-w-3xl space-y-4 print:space-y-0">
      <div className="print:hidden">
        <h1 className="text-lg font-extrabold text-ink">قائمة التجهيز</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {orders.length} طلب{orders.length === 1 ? "" : "ات"} · {rows.length} صنف — استخدم طباعة المتصفح (Ctrl/Cmd+P).
        </p>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-200 text-right text-xs font-extrabold text-ink-soft">
            <th className="py-2">SKU</th>
            <th className="py-2">المنتج</th>
            <th className="py-2">الكمية الإجمالية</th>
            <th className="py-2">الطلبات</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sku} className="border-b border-stone-100">
              <td dir="ltr" className="py-2 text-xs text-ink-soft">{row.sku}</td>
              <td className="py-2 font-bold text-ink">{row.productName} – {row.variantName}</td>
              <td dir="ltr" className="py-2 tabular-nums font-extrabold">{row.quantity}</td>
              <td dir="ltr" className="py-2 text-xs text-ink-soft">{Array.from(row.orderNumbers).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
