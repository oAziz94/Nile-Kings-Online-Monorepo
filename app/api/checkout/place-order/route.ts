import { requireCustomer } from "@/lib/auth/session";
import { placeOrder } from "@/lib/checkout/place-order";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { withApiHandler } from "@/lib/api/with-api-handler";
import { invalidateAnalyticsCache } from "@/lib/cache/analytics";
import { PAYMENT_METHODS } from "@/lib/checkout/types";
import { assignOrderToGovernorate } from "@/lib/rerouting/assign";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";
import { getCurrentStorefrontStockContext } from "@/lib/storefront-location";

const addressSchema = {
  governorate: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  city: (v: unknown) => typeof v === "string" && v.trim().length > 0,
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
  if (!addressSchema.city(address.city)) {
    return apiBadRequest("المدينة مطلوبة");
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
  const normalizedPhone = normalizeEgyptMobilePhone(String(address.phone));
  if (!normalizedPhone) {
    return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);
  }

  const paymentMethod = body.paymentMethod;
  if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod as "COD" | "PAYMOB" | "INSTAPAY_PREPAID")) {
    return apiBadRequest("طريقة الدفع مطلوبة (COD أو PAYMOB أو InstaPay)");
  }

  // Authoritative partner: resolved from the customer's chosen delivery governorate (cookie),
  // same one whose stock was shown throughout browsing/cart — never from the shipping
  // address's governorate, which may point elsewhere (e.g. shipping to a relative in another
  // governorate). Both the preferred-partner lookup and its no-partner-selected fallback below
  // key off this chosen governorate only.
  const stockContext = await getCurrentStorefrontStockContext();
  if (!stockContext.governorate) {
    return apiBadRequest("اختر محافظة التوصيل من أعلى الصفحة أولاً", {
      code: "GOVERNORATE_NOT_SELECTED",
    });
  }

  const result = await placeOrder({
    userId: user.userId,
    address: {
      governorate: String(address.governorate).trim(),
      city: String(address.city).trim(),
      area: String(address.area).trim(),
      street: String(address.street).trim(),
      floor: address.floor != null ? String(address.floor) : null,
      apartment: address.apartment != null ? String(address.apartment) : null,
      notes: address.notes != null ? String(address.notes) : null,
      phone: normalizedPhone,
    },
    paymentMethod: paymentMethod as "COD" | "PAYMOB" | "INSTAPAY_PREPAID",
    couponCode: body.couponCode ?? null,
    selectedPartnerId: stockContext.partnerId,
    selectedGovernorate: stockContext.governorate,
  });

  if (!result.success) {
    return apiBadRequest(result.error, {
      code: result.code,
      ...(result.outOfStockItems ? { outOfStockItems: result.outOfStockItems } : {}),
    });
  }

  try {
    await assignOrderToGovernorate(result.orderId);
  } catch (e) {
    console.error("[place-order] Governorate rerouting failed:", e);
  }

  await invalidateAnalyticsCache();

  return apiSuccess({
    orderId: result.orderId,
    status: result.status,
  });
}

export const POST = withApiHandler(postHandler);
