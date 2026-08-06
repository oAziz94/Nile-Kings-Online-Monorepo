import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

const PARTNER_STATUSES = ["ACCEPTED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED"] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requirePartner();
    const { id } = await params;
    const routed = await prisma.routedOrder.findFirst({
      where: { id, partnerId: user.partnerId },
      include: {
        order: {
          include: {
            user: { select: { name: true, phone: true } },
            items: { select: { productName: true, variantName: true, quantity: true, totalPiastres: true } },
          },
        },
      },
    });
    if (!routed) return apiNotFound("الطلب غير موجود");
    return apiSuccess(routed);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requirePartner();
    const { id } = await params;
    const existing = await prisma.routedOrder.findFirst({
      where: { id, partnerId: user.partnerId },
    });
    if (!existing) return apiNotFound("الطلب غير موجود");

    let body: { status?: string; notes?: string | null };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const data: {
      status?: (typeof PARTNER_STATUSES)[number];
      notes?: string | null;
      acceptedAt?: Date;
      deliveredAt?: Date;
    } = {};

    if (typeof body.status === "string") {
      if (!PARTNER_STATUSES.includes(body.status as (typeof PARTNER_STATUSES)[number])) {
        return apiBadRequest("حالة غير متاحة للشريك");
      }
      data.status = body.status as (typeof PARTNER_STATUSES)[number];
      if (data.status === "ACCEPTED") data.acceptedAt = new Date();
      if (data.status === "DELIVERED") data.deliveredAt = new Date();
    }
    if (body.notes !== undefined) data.notes = body.notes === "" ? null : String(body.notes).trim();

    const updated = await prisma.routedOrder.update({
      where: { id },
      data,
      include: {
        order: {
          include: {
            user: { select: { name: true, phone: true } },
            items: { select: { productName: true, variantName: true, quantity: true, totalPiastres: true } },
          },
        },
      },
    });
    return apiSuccess(updated);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
