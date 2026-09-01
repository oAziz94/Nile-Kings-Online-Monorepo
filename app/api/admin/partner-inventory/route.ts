import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { sortVariants } from "@/lib/admin/variant-sort";
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
  const partnerId = (searchParams.get("partnerId") ?? "").trim();
  if (!partnerId) return apiBadRequest("partnerId مطلوب");

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, name: true, phone: true, partnerType: true, governorate: true },
  });
  if (!partner) return apiBadRequest("الشريك غير موجود");

  const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const lowOnly = searchParams.get("lowOnly") === "true";
  const needsSetupOnly = searchParams.get("needsSetupOnly") === "true";
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { slug: { contains: q, mode: "insensitive" } },
            { category: { name: { contains: q, mode: "insensitive" } } },
            { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
            { variants: { some: { name: { contains: q, mode: "insensitive" } } } },
            { variants: { some: { colorName: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          select: {
            id: true,
            sku: true,
            name: true,
            colorName: true,
            colorHex: true,
            partnerInventories: {
              where: { partnerId },
              select: { id: true, stockAvailable: true, stockReserved: true, updatedAt: true },
            },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const rows = products
    .map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      category: product.category,
      variants: sortVariants(product.variants).map((variant) => {
        const inventory = variant.partnerInventories[0] ?? null;
        const stockAvailable = inventory?.stockAvailable ?? 0;
        const stockReserved = inventory?.stockReserved ?? 0;
        return {
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          colorName: variant.colorName,
          colorHex: variant.colorHex,
          inventoryId: inventory?.id ?? null,
          stockAvailable,
          stockReserved,
          sellable: Math.max(0, stockAvailable - stockReserved),
          updatedAt: inventory?.updatedAt ?? null,
        };
      }),
    }))
    .filter((product) => !lowOnly || product.variants.some((v) => v.sellable <= 3))
    .filter((product) => !needsSetupOnly || product.variants.some((v) => v.inventoryId === null));

  return apiSuccess({ partner, products: rows, total, limit, offset });
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
        notes: body.notes?.trim() || "Admin dashboard stock edit",
      },
    });

    return row;
  });

  if (!updated) return apiBadRequest("المحجوز لا يمكن أن يكون أكبر من المتاح");
  return apiSuccess(updated);
}
