import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { buildCheckoutSummary } from "@/lib/checkout/summary";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

const addressSchema = {
  governorate: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  city: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  area: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  street: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  floor: (v: unknown) => v == null || typeof v === "string",
  apartment: (v: unknown) => v == null || typeof v === "string",
  notes: (v: unknown) => v == null || typeof v === "string",
  phone: (v: unknown) => typeof v === "string" && v.trim().length > 0,
};

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول لإتمام الطلب");
  }

  let body: {
    address?: Record<string, unknown>;
    couponCode?: string | null;
    paymentMethod?: string;
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

  const summary = await buildCheckoutSummary({
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
    couponCode: body.couponCode ?? null,
    paymentMethod: body.paymentMethod === "COD" || body.paymentMethod === "PAYMOB" || body.paymentMethod === "INSTAPAY_PREPAID" ? body.paymentMethod : undefined,
  });

  if (!summary) {
    return apiBadRequest("السلة فارغة، أو وزن أحد المنتجات غير محدد، أو لا يمكن حساب الشحن للمحافظة المختارة");
  }

  return apiSuccess(summary);
}
