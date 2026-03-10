import { requireCustomer } from "@/lib/auth/session";
import { placeOrder } from "@/lib/checkout/place-order";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { withApiHandler } from "@/lib/api/with-api-handler";
import { invalidateAnalyticsCache } from "@/lib/cache/analytics";
import { PAYMENT_METHODS } from "@/lib/checkout/types";

const addressSchema = {
  governorate: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  area: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  street: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  phone: (v: unknown) => typeof v === "string" && v.trim().length > 0,
};

async function postHandler(req: Request) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول لإتمام الطلب");
  }

  let body: {
    address?: Record<string, unknown>;
    paymentMethod?: string;
    couponCode?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const address = body.address;
  if (!address || typeof address !== "object") {
    return apiBadRequest("عنوان التوصيل مطلوب");
  }
  if (!addressSchema.governorate(address.governorate)) {
    return apiBadRequest("المحافظة مطلوبة");
  }
  if (!addressSchema.area(address.area)) {
    return apiBadRequest("المنطقة مطلوبة");
  }
  if (!addressSchema.street(address.street)) {
    return apiBadRequest("العنوان بالتفصيل مطلوب");
  }
  if (!addressSchema.phone(address.phone)) {
    return apiBadRequest("رقم هاتف التوصيل مطلوب");
  }

  const paymentMethod = body.paymentMethod;
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as "COD" | "PAYMOB" | "INSTAPAY_PREPAID")) {
    return apiBadRequest("طريقة الدفع مطلوبة (COD أو PAYMOB أو InstaPay)");
  }

  const result = await placeOrder({
    userId: user.userId,
    address: {
      governorate: String(address.governorate).trim(),
      city: address.city != null ? String(address.city).trim() : null,
      area: String(address.area).trim(),
      street: String(address.street).trim(),
      floor: address.floor != null ? String(address.floor) : null,
      apartment: address.apartment != null ? String(address.apartment) : null,
      notes: address.notes != null ? String(address.notes) : null,
      phone: String(address.phone).trim(),
    },
    paymentMethod: paymentMethod as "COD" | "PAYMOB" | "INSTAPAY_PREPAID",
    couponCode: body.couponCode ?? null,
  });

  if (!result.success) {
    return apiBadRequest(result.error, { code: result.code });
  }

  await invalidateAnalyticsCache();

  return apiSuccess({
    orderId: result.orderId,
    status: result.status,
  });
}

export const POST = withApiHandler(postHandler);
