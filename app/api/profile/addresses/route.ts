import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

const addressBodySchema = {
  label: (v: unknown) => v == null || typeof v === "string",
  governorate: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  city: (v: unknown) => v == null || typeof v === "string",
  area: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  street: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  building: (v: unknown) => v == null || typeof v === "string",
  floor: (v: unknown) => v == null || typeof v === "string",
  apartment: (v: unknown) => v == null || typeof v === "string",
  notes: (v: unknown) => v == null || typeof v === "string",
  phone: (v: unknown) => typeof v === "string" && v.trim().length > 0,
  isDefault: (v: unknown) => v == null || typeof v === "boolean",
};

/** GET /api/profile/addresses — list saved addresses */
export async function GET() {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const list = await prisma.savedAddress.findMany({
    where: { userId: user.userId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  return apiSuccess(list);
}

/** POST /api/profile/addresses — create saved address */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (!addressBodySchema.governorate(body.governorate)) return apiBadRequest("المحافظة مطلوبة");
  if (!(typeof body.city === "string" && body.city.trim().length > 0)) return apiBadRequest("المدينة مطلوبة");
  if (!addressBodySchema.area(body.area)) return apiBadRequest("المنطقة مطلوبة");
  if (!addressBodySchema.street(body.street)) return apiBadRequest("العنوان بالتفصيل مطلوب");
  if (!addressBodySchema.phone(body.phone)) return apiBadRequest("رقم الهاتف مطلوب");

  const normalizedPhone = normalizeEgyptMobilePhone(String(body.phone));
  if (!normalizedPhone) return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);

  const isDefault = addressBodySchema.isDefault(body.isDefault) ? !!body.isDefault : false;

  if (isDefault) {
    await prisma.savedAddress.updateMany({
      where: { userId: user.userId },
      data: { isDefault: false },
    });
  }

  const created = await prisma.savedAddress.create({
    data: {
      userId: user.userId,
      label: addressBodySchema.label(body.label) ? (body.label as string)?.trim() || null : null,
      governorate: String(body.governorate).trim(),
      city: body.city != null ? String(body.city).trim() || null : null,
      area: body.area != null ? String(body.area).trim() || null : null,
      street: String(body.street).trim(),
      building: body.building != null ? String(body.building).trim() || null : null,
      floor: body.floor != null ? String(body.floor).trim() || null : null,
      apartment: body.apartment != null ? String(body.apartment).trim() || null : null,
      notes: body.notes != null ? String(body.notes).trim() || null : null,
      phone: normalizedPhone,
      isDefault,
    },
  });

  return apiSuccess(created, undefined, 201);
}
