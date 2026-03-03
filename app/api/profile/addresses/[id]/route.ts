import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiNotFound } from "@/lib/api/response";

const addressBodySchema = {
  label: (v: unknown) => v == null || typeof v === "string",
  governorate: (v: unknown) => v == null || (typeof v === "string" && v.trim().length > 0),
  city: (v: unknown) => v == null || typeof v === "string",
  area: (v: unknown) => v == null || typeof v === "string",
  street: (v: unknown) => v == null || (typeof v === "string" && v.trim().length > 0),
  building: (v: unknown) => v == null || typeof v === "string",
  floor: (v: unknown) => v == null || typeof v === "string",
  apartment: (v: unknown) => v == null || typeof v === "string",
  notes: (v: unknown) => v == null || typeof v === "string",
  phone: (v: unknown) => v == null || (typeof v === "string" && v.trim().length > 0),
  isDefault: (v: unknown) => v == null || typeof v === "boolean",
};

/** PATCH /api/profile/addresses/[id] — update saved address */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { id } = await params;
  const existing = await prisma.savedAddress.findFirst({
    where: { id, userId: user.userId },
  });
  if (!existing) return apiNotFound("العنوان غير موجود");

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const isDefault = body.isDefault === true;
  if (isDefault) {
    await prisma.savedAddress.updateMany({
      where: { userId: user.userId },
      data: { isDefault: false },
    });
  }

  const data: Record<string, unknown> = {};
  if (body.label !== undefined && addressBodySchema.label(body.label))
    data.label = (body.label as string)?.trim() || null;
  if (body.governorate !== undefined && addressBodySchema.governorate(body.governorate))
    data.governorate = String(body.governorate).trim();
  if (body.city !== undefined) data.city = body.city != null ? String(body.city).trim() || null : null;
  if (body.area !== undefined) data.area = body.area != null ? String(body.area).trim() || null : null;
  if (body.street !== undefined && addressBodySchema.street(body.street))
    data.street = String(body.street).trim();
  if (body.building !== undefined) data.building = body.building != null ? String(body.building).trim() || null : null;
  if (body.floor !== undefined) data.floor = body.floor != null ? String(body.floor).trim() || null : null;
  if (body.apartment !== undefined) data.apartment = body.apartment != null ? String(body.apartment).trim() || null : null;
  if (body.notes !== undefined) data.notes = body.notes != null ? String(body.notes).trim() || null : null;
  if (body.phone !== undefined && addressBodySchema.phone(body.phone))
    data.phone = String(body.phone).trim();
  if (body.isDefault !== undefined) data.isDefault = isDefault;

  const updated = await prisma.savedAddress.update({
    where: { id },
    data: data as Parameters<typeof prisma.savedAddress.update>[0]["data"],
  });

  return apiSuccess(updated);
}

/** DELETE /api/profile/addresses/[id] */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { id } = await params;
  const existing = await prisma.savedAddress.findFirst({
    where: { id, userId: user.userId },
  });
  if (!existing) return apiNotFound("العنوان غير موجود");

  await prisma.savedAddress.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
