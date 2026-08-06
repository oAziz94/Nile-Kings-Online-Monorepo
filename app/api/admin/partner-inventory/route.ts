import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }

  const { searchParams } = new URL(req.url);
  const partnerId = searchParams.get("partnerId")?.trim();
  const variantId = searchParams.get("variantId")?.trim();
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 100) || 100));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

  const where = {
    ...(partnerId ? { partnerId } : {}),
    ...(variantId ? { variantId } : {}),
  };

  const [inventory, total] = await Promise.all([
    prisma.partnerInventory.findMany({
      where,
      include: {
        partner: { select: { id: true, name: true, phone: true, partnerType: true, governorate: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            colorName: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: [{ partner: { name: "asc" } }, { variant: { sku: "asc" } }],
      take: limit,
      skip: offset,
    }),
    prisma.partnerInventory.count({ where }),
  ]);

  return apiSuccess({ inventory, total, limit, offset });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }

  let body: {
    partnerId?: string;
    variantId?: string;
    stockAvailable?: number;
    stockReserved?: number;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const partnerId = body.partnerId?.trim();
  const variantId = body.variantId?.trim();
  if (!partnerId || !variantId) return apiBadRequest("partnerId و variantId مطلوبان");
  if (typeof body.stockAvailable !== "number" || body.stockAvailable < 0) {
    return apiBadRequest("stockAvailable يجب أن يكون رقماً موجباً");
  }
  if (body.stockReserved !== undefined && (typeof body.stockReserved !== "number" || body.stockReserved < 0)) {
    return apiBadRequest("stockReserved يجب أن يكون رقماً موجباً");
  }
  const stockAvailable = body.stockAvailable;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId, variantId } },
    });
    const nextReserved = body.stockReserved ?? existing?.stockReserved ?? 0;
    if (nextReserved > stockAvailable) {
      return null;
    }

    const row = await tx.partnerInventory.upsert({
      where: { partnerId_variantId: { partnerId, variantId } },
      update: {
        stockAvailable,
        stockReserved: nextReserved,
      },
      create: {
        partnerId,
        variantId,
        stockAvailable,
        stockReserved: nextReserved,
      },
    });

    await tx.inventoryLedger.create({
      data: {
        partnerId,
        variantId,
        reason: "MANUAL_ADJUSTMENT",
        quantityAvailableDelta: stockAvailable - (existing?.stockAvailable ?? 0),
        quantityReservedDelta: nextReserved - (existing?.stockReserved ?? 0),
        notes: body.notes?.trim() || null,
      },
    });

    return row;
  });

  if (!updated) return apiBadRequest("المحجوز لا يمكن أن يكون أكبر من المتاح");
  return apiSuccess(updated);
}
