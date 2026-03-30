import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string; addressId: string }>;

type AddressPatchBody = {
  label?: string | null;
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  street?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone?: string | null;
  isDefault?: boolean;
};

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { id: userId, addressId } = await params;

  const user = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER" },
    select: { id: true },
  });
  if (!user) return apiNotFound("العميل غير موجود");

  const existing = await prisma.savedAddress.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });
  if (!existing) return apiNotFound("العنوان غير موجود");

  let body: AddressPatchBody;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (body.governorate !== undefined && !String(body.governorate ?? "").trim())
    return apiBadRequest("المحافظة مطلوبة");
  if (body.area !== undefined && !String(body.area ?? "").trim()) return apiBadRequest("المنطقة مطلوبة");
  if (body.street !== undefined && !String(body.street ?? "").trim())
    return apiBadRequest("العنوان بالتفصيل مطلوب");
  if (body.phone !== undefined && !String(body.phone ?? "").trim())
    return apiBadRequest("رقم الهاتف مطلوب");

  const makeNullableText = (value: string | null | undefined) =>
    value == null ? null : String(value).trim() || null;

  const isDefault = body.isDefault === true;
  if (isDefault) {
    await prisma.savedAddress.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.savedAddress.update({
    where: { id: addressId },
    data: {
      ...(body.label !== undefined && { label: makeNullableText(body.label) }),
      ...(body.governorate !== undefined && { governorate: String(body.governorate).trim() }),
      ...(body.city !== undefined && { city: makeNullableText(body.city) }),
      ...(body.area !== undefined && { area: makeNullableText(body.area) }),
      ...(body.street !== undefined && { street: String(body.street).trim() }),
      ...(body.building !== undefined && { building: makeNullableText(body.building) }),
      ...(body.floor !== undefined && { floor: makeNullableText(body.floor) }),
      ...(body.apartment !== undefined && { apartment: makeNullableText(body.apartment) }),
      ...(body.notes !== undefined && { notes: makeNullableText(body.notes) }),
      ...(body.phone !== undefined && { phone: String(body.phone).trim() }),
      ...(body.isDefault !== undefined && { isDefault }),
    },
  });

  return apiSuccess(updated);
}
