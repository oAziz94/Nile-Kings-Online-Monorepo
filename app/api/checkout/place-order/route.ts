import { requireCustomer } from "@/lib/auth/session";
import { placeOrder } from "@/lib/checkout/place-order";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { withApiHandler } from "@/lib/api/with-api-handler";
import { invalidateAnalyticsCache } from "@/lib/cache/analytics";
import { SHIPPING_PROVIDERS } from "@/lib/services/shipping";
import { PAYMENT_METHODS } from "@/lib/checkout/types";

const addressSchema = {
  governorate: (v: unknown) => typeof v === "string" && v.trim().length > 0,
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
    provider?: string;
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
  if (!addressSchema.street(address.street)) {
    return apiBadRequest("الشارع مطلوب");
  }
  if (!addressSchema.phone(address.phone)) {
    return apiBadRequest("رقم هاتف التوصيل مطلوب");
  }

  const provider = typeof body.provider === "string" ? body.provider.trim() : "";
  if (!provider || !SHIPPING_PROVIDERS.includes(provider as "Turbo" | "Egypt Post")) {
    return apiBadRequest("يجب اختيار شركة الشحن (Turbo أو Egypt Post)");
  }

  const paymentMethod = body.paymentMethod;
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as "COD" | "PAYMOB")) {
    return apiBadRequest("طريقة الدفع مطلوبة (COD أو PAYMOB)");
  }

  const result = await placeOrder({
    userId: user.userId,
    address: {
      governorate: String(address.governorate).trim(),
      city: address.city != null ? String(address.city) : null,
      area: address.area != null ? String(address.area) : null,
      street: String(address.street).trim(),
      building: address.building != null ? String(address.building) : null,
      floor: address.floor != null ? String(address.floor) : null,
      apartment: address.apartment != null ? String(address.apartment) : null,
      notes: address.notes != null ? String(address.notes) : null,
      phone: String(address.phone).trim(),
    },
    provider,
    paymentMethod: paymentMethod as "COD" | "PAYMOB",
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
