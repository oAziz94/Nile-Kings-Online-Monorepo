import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { buildCheckoutSummaryFromLines } from "@/lib/checkout/summary";
import {
  parseOrderLineItems,
  parsePaymentMethod,
  resolveOrderCheckoutAddress,
} from "@/lib/admin/order-create";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return apiBadRequest("العميل مطلوب");

  const user = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER" },
    select: { id: true },
  });
  if (!user) return apiBadRequest("العميل غير موجود");

  const itemsParsed = parseOrderLineItems(body.items);
  if (!itemsParsed.ok) return apiBadRequest(itemsParsed.message);

  const paymentParsed = parsePaymentMethod(body.paymentMethod);
  if (!paymentParsed.ok) return apiBadRequest(paymentParsed.message);

  const addressResolved = await resolveOrderCheckoutAddress({
    userId,
    savedAddressId: typeof body.savedAddressId === "string" ? body.savedAddressId.trim() : undefined,
    address: body.address,
  });
  if (!addressResolved.ok) return apiBadRequest(addressResolved.message);

  const summary = await buildCheckoutSummaryFromLines({
    userId,
    address: addressResolved.address,
    lines: itemsParsed.items,
    couponCode: typeof body.couponCode === "string" ? body.couponCode.trim() || null : null,
    paymentMethod: paymentParsed.method,
  });

  if (!summary) {
    return apiBadRequest(
      "تعذر حساب الملخص: تحقق من الأصناف والوزن والعنوان"
    );
  }

  return apiSuccess({ summary });
}
