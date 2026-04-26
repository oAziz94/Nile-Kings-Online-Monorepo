import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { piastresToEgp } from "@/lib/catalog";
import { getOrderStatusLabel } from "@/lib/constants/order-status";
import { formatDateEn } from "@/lib/format-en-numbers";

const MAX_EXPORT = 200;

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "الدفع عبر InstaPay",
  PAYMOB: "بطاقة",
};

function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function egpCell(piastres: number): string {
  return String(piastresToEgp(piastres));
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const body = await req.json().catch(() => null);
  const orderIds: string[] = Array.isArray(body?.orderIds)
    ? body.orderIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (orderIds.length === 0) {
    return apiBadRequest("يجب اختيار طلب واحد على الأقل للتصدير");
  }

  if (orderIds.length > MAX_EXPORT) {
    return apiBadRequest(`الحد الأقصى للتصدير هو ${MAX_EXPORT} طلبًا`);
  }

  const uniqueIds = [...new Set(orderIds)];

  const orders = await prisma.order.findMany({
    where: { id: { in: uniqueIds } },
    include: {
      user: { select: { phone: true, name: true } },
      items: { select: { productName: true, variantName: true, quantity: true } },
    },
  });

  const byId = new Map(orders.map((o) => [o.id, o]));
  const ordered = uniqueIds.map((id) => byId.get(id)).filter((o): o is NonNullable<typeof o> => Boolean(o));

  if (ordered.length === 0) {
    return apiBadRequest("لم يتم العثور على أي من الطلبات المحددة");
  }

  const headers = [
    "معرف الطلب",
    "الرقم المختصر",
    "هاتف العميل",
    "اسم العميل",
    "المجموع الفرعي (ج.م)",
    "الشحن (ج.م)",
    "رسوم الدفع عند الاستلام (ج.م)",
    "الإجمالي (ج.م)",
    "طريقة الدفع",
    "الحالة",
    "التاريخ",
    "المنتجات",
  ];

  const lines = [
    headers.map(csvCell).join(","),
    ...ordered.map((o) => {
      const itemsSummary = o.items
        .map((i) => {
          const v = i.variantName ? ` (${i.variantName})` : "";
          return `${i.productName}${v} ×${i.quantity}`;
        })
        .join(" | ");
      return [
        csvCell(o.id),
        csvCell(o.id.slice(0, 8)),
        csvCell(o.user.phone),
        csvCell(o.user.name ?? ""),
        csvCell(egpCell(o.subtotalPiastres)),
        csvCell(egpCell(o.shippingPiastres)),
        csvCell(egpCell(o.codFeePiastres)),
        csvCell(egpCell(o.totalPiastres)),
        csvCell(PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod),
        csvCell(getOrderStatusLabel(o.status)),
        csvCell(formatDateEn(o.createdAt)),
        csvCell(itemsSummary),
      ].join(",");
    }),
  ];

  const csv = `\uFEFF${lines.join("\r\n")}`;
  const stamp = new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "");
  const filename = `orders-export-${stamp}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
