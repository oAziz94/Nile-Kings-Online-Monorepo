import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { getPhase1ShippingFee, PHASE1_SHIPPING_PROVIDER_DISPLAY } from "@/lib/services/shipping";
import { getCodFeePercent } from "@/lib/settings";

const ORDER_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, phone: true, name: true } },
      items: true,
    },
  });
  if (!order) return apiNotFound("الطلب غير موجود");
  return apiSuccess(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const existing = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { select: { weightGrams: true } },
            },
          },
        },
      },
    },
  });
  if (!existing) return apiNotFound("الطلب غير موجود");

  let body: { status?: string; userId?: string; savedAddressId?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const nextStatus = typeof body.status === "string" ? body.status : undefined;
  const nextUserId = typeof body.userId === "string" ? body.userId.trim() : undefined;
  const nextSavedAddressId =
    typeof body.savedAddressId === "string" ? body.savedAddressId.trim() : undefined;

  if (!nextStatus && !nextUserId && !nextSavedAddressId) {
    return apiBadRequest("لا توجد حقول للتحديث");
  }
  if (nextStatus && !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
    return apiBadRequest("status غير صالح: " + ORDER_STATUSES.join(", "));
  }
  if (nextSavedAddressId && !nextUserId) {
    return apiBadRequest("يجب إرسال userId مع savedAddressId");
  }

  const data: Prisma.OrderUpdateInput = {};
  if (nextStatus) data.status = nextStatus as (typeof ORDER_STATUSES)[number];

  if (nextUserId) {
    const user = await prisma.user.findFirst({
      where: { id: nextUserId, role: "CUSTOMER" },
      select: { id: true },
    });
    if (!user) return apiBadRequest("العميل غير موجود");

    if (nextSavedAddressId) {
      const savedAddress = await prisma.savedAddress.findFirst({
        where: { id: nextSavedAddressId, userId: nextUserId },
      });
      if (!savedAddress) return apiBadRequest("العنوان غير موجود لهذا العميل");

      data.shippingAddress = {
        governorate: savedAddress.governorate,
        city: savedAddress.city,
        area: savedAddress.area,
        street: savedAddress.street,
        building: savedAddress.building,
        floor: savedAddress.floor,
        apartment: savedAddress.apartment,
        notes: savedAddress.notes,
        phone: savedAddress.phone,
        label: savedAddress.label,
        savedAddressId: savedAddress.id,
      };

      let weightGrams = 0;
      for (const item of existing.items) {
        const w = item.variant.product.weightGrams;
        if (w == null || w < 0) {
          return apiBadRequest("لا يمكن إعادة حساب الشحن: وزن بعض المنتجات غير متوفر");
        }
        weightGrams += item.quantity * w;
      }

      const shippingOption = getPhase1ShippingFee(
        {
          governorate: savedAddress.governorate,
          city: savedAddress.city,
          area: savedAddress.area,
        },
        weightGrams
      );
      if (!shippingOption) {
        return apiBadRequest("لا يمكن حساب الشحن لهذا العنوان");
      }

      const itemsAfterDiscounts = Math.max(
        0,
        existing.subtotalPiastres - existing.discountPiastres - existing.seniorFreeValuePiastres
      );
      const beforeCod = itemsAfterDiscounts + shippingOption.feePiastres;
      const codFeePercent = await getCodFeePercent();
      const codFee =
        existing.paymentMethod === "COD"
          ? Math.round((beforeCod * codFeePercent) / 100)
          : 0;

      data.shippingProvider = PHASE1_SHIPPING_PROVIDER_DISPLAY;
      data.shippingPiastres = shippingOption.feePiastres;
      data.codFeePiastres = codFee;
      data.totalPiastres = beforeCod + codFee;
    }

    data.user = { connect: { id: nextUserId } };
  }

  const order = await prisma.order.update({
    where: { id },
    data,
    include: {
      user: { select: { id: true, phone: true, name: true } },
      items: true,
    },
  });
  return apiSuccess(order);
}
