import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

const ROUTED_STATUSES = [
  "ASSIGNED",
  "NOTIFIED",
  "ACCEPTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
  "UNROUTED",
] as const;

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
  const routed = await prisma.routedOrder.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          user: { select: { id: true, phone: true, name: true } },
          items: { select: { productName: true, variantName: true, quantity: true, totalPiastres: true } },
        },
      },
      partner: { select: { id: true, name: true, phone: true, partnerType: true } },
      rule: { select: { id: true, governorate: true } },
    },
  });
  if (!routed) return apiNotFound("السجل غير موجود");
  return apiSuccess(routed);
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
  const existing = await prisma.routedOrder.findUnique({ where: { id } });
  if (!existing) return apiNotFound("السجل غير موجود");

  let body: { status?: string; notes?: string | null; proofImageUrl?: string | null; proofImagePublicId?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const data: {
    status?: (typeof ROUTED_STATUSES)[number];
    notes?: string | null;
    proofImageUrl?: string | null;
    proofImagePublicId?: string | null;
    acceptedAt?: Date | null;
    deliveredAt?: Date | null;
  } = {};

  if (typeof body.status === "string" && ROUTED_STATUSES.includes(body.status as (typeof ROUTED_STATUSES)[number])) {
    data.status = body.status as (typeof ROUTED_STATUSES)[number];
    if (data.status === "ACCEPTED") data.acceptedAt = new Date();
    if (data.status === "DELIVERED") data.deliveredAt = new Date();
  }
  if (body.notes !== undefined) data.notes = body.notes === "" ? null : String(body.notes).trim();
  if (body.proofImageUrl !== undefined) data.proofImageUrl = body.proofImageUrl === "" ? null : String(body.proofImageUrl);
  if (body.proofImagePublicId !== undefined) data.proofImagePublicId = body.proofImagePublicId === "" ? null : String(body.proofImagePublicId);

  const updated = await prisma.routedOrder.update({
    where: { id },
    data,
    include: {
      order: {
        include: {
          user: { select: { id: true, phone: true, name: true } },
          items: { select: { productName: true, variantName: true, quantity: true, totalPiastres: true } },
        },
      },
      partner: { select: { id: true, name: true, phone: true, partnerType: true } },
      rule: { select: { id: true, governorate: true } },
    },
  });
  return apiSuccess(updated);
}
