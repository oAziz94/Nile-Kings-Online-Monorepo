import { AlertTriangle } from "lucide-react";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDateEn } from "@/lib/format-en-numbers";
import { ProductImagePlaceholder } from "@/components/shared/product-image-preview";

/**
 * "طباعة قائمة التجهيز" (backlog 5.3) — print-only pick list for a bulk selection from
 * `/partner/orders`. Rendered inside the normal partner shell (`(partner)/partner/layout.tsx`
 * → `PartnerShell`), whose chrome already carries `data-partner-chrome`/`print:hidden` —
 * on-screen it shows the shell, on `window.print()` only this page's content survives.
 * Server-checks every id in `?ids=` belongs to this partner before rendering anything —
 * a single foreign id renders the whole page as a 403 panel instead of a partial list.
 */

type ShippingAddress = {
  governorate?: string;
  city?: string | null;
  area?: string | null;
  street?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
};

function addressLine(address: ShippingAddress): string {
  return [
    address.governorate,
    address.city,
    address.area,
    address.street,
    address.building ? `مبنى ${address.building}` : null,
    address.floor ? `دور ${address.floor}` : null,
    address.apartment ? `شقة ${address.apartment}` : null,
  ]
    .filter(Boolean)
    .join("، ");
}

export default async function PickListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requirePartner();
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
    where: { id: { in: ids }, assignedPartnerId: user.partnerId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true, phone: true } },
      items: {
        select: {
          productName: true,
          variantName: true,
          sku: true,
          quantity: true,
          variant: { select: { imageUrl: true, product: { select: { imageUrl: true } } } },
        },
      },
    },
  });

  // Every requested id must belong to this partner — a foreign/missing id 403s the whole page
  // rather than silently printing a partial list.
  if (orders.length !== ids.length) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-danger-text/30 bg-danger-bg p-8 text-danger-text">
        <p className="flex items-center gap-2 text-sm font-extrabold">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          غير مصرح
        </p>
        <p className="mt-2 text-sm">أحد الطلبات المحددة غير مسند إليك أو غير موجود.</p>
      </div>
    );
  }

  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordered = ids.map((id) => byId.get(id)!).filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-6 print:space-y-0">
      <div className="print:hidden">
        <h1 className="text-lg font-extrabold text-ink">قائمة التجهيز</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {ordered.length} طلب{ordered.length === 1 ? "" : "ات"} — استخدم طباعة المتصفح (Ctrl/Cmd+P).
        </p>
      </div>

      {ordered.map((order) => (
        <section
          key={order.id}
          className="break-after-page rounded-2xl border border-stone-200 bg-white p-6 print:rounded-none print:border-0 print:p-0"
        >
          <header className="mb-4 flex items-center justify-between border-b border-stone-200 pb-3">
            <div>
              <p dir="ltr" className="text-right text-base font-extrabold text-ink">
                #{order.id.slice(0, 8)}
              </p>
              <p className="text-xs text-ink-soft">{formatDateEn(order.createdAt)}</p>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-ink">{order.user?.name ?? "عميل بدون اسم"}</p>
              <p dir="ltr" className="text-xs text-ink-soft">
                {order.user?.phone}
              </p>
            </div>
          </header>

          <p className="mb-4 text-sm text-ink">{addressLine((order.shippingAddress ?? {}) as ShippingAddress)}</p>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-right text-xs font-extrabold text-ink-soft">
                <th className="py-2">الصورة</th>
                <th className="py-2">المنتج</th>
                <th className="py-2">SKU</th>
                <th className="py-2">الكمية</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, idx) => {
                const imageUrl = item.variant.imageUrl ?? item.variant.product.imageUrl ?? null;
                return (
                  <tr key={idx} className="border-b border-stone-100">
                    <td className="py-2">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={item.productName}
                          className="h-10 w-10 rounded-md border border-stone-200 object-cover"
                        />
                      ) : (
                        <ProductImagePlaceholder size={40} className="rounded-md border border-stone-200" />
                      )}
                    </td>
                    <td className="py-2 font-bold text-ink">
                      {item.productName} – {item.variantName}
                    </td>
                    <td dir="ltr" className="py-2 text-xs text-ink-soft">
                      {item.sku}
                    </td>
                    <td dir="ltr" className="py-2 tabular-nums">
                      {item.quantity}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
