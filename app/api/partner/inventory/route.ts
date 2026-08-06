import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { sortVariants } from "@/lib/admin/variant-sort";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

async function requireInventoryPartner() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { id: true, name: true, phone: true, partnerType: true, governorate: true },
  });
  if (!partner || !["AGENT", "DISTRIBUTOR"].includes(partner.partnerType)) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return { user, partner };
}

export async function GET(req: NextRequest) {
  try {
    const { user, partner } = await requireInventoryPartner();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
    const productId = (searchParams.get("productId") ?? "").trim();
    const lowOnly = searchParams.get("lowOnly") === "true";
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

    const where: Prisma.ProductWhereInput = {
      active: true,
      ...(productId ? { id: productId } : {}),
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
              imageUrl: true,
              pricePiastres: true,
              basePricePiastres: true,
              partnerInventories: {
                where: { partnerId: user.partnerId },
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
        ...product,
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
            imageUrl: variant.imageUrl,
            pricePiastres: variant.pricePiastres,
            basePricePiastres: variant.basePricePiastres,
            inventoryId: inventory?.id ?? null,
            stockAvailable,
            stockReserved,
            sellable: Math.max(0, stockAvailable - stockReserved),
            updatedAt: inventory?.updatedAt ?? null,
          };
        }),
      }))
      .filter((product) => !lowOnly || product.variants.some((variant) => variant.sellable <= 3));

    return apiSuccess({ partner, products: rows, total, limit, offset });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { user } = await requireInventoryPartner();
    let body: { variantId?: string; stockAvailable?: number };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const variantId = body.variantId?.trim();
    const stockAvailableInput = body.stockAvailable;
    if (!variantId) return apiBadRequest("variantId مطلوب");
    if (
      typeof stockAvailableInput !== "number" ||
      !Number.isInteger(stockAvailableInput) ||
      stockAvailableInput < 0
    ) {
      return apiBadRequest("المخزون يجب أن يكون رقماً صحيحاً موجباً");
    }
    const stockAvailable = stockAvailableInput;

    const updated = await prisma.$transaction(async (tx) => {
      const variant = await tx.variant.findUnique({
        where: { id: variantId },
        select: { id: true, sku: true },
      });
      if (!variant) return { kind: "missing" as const };

      const existing = await tx.partnerInventory.findUnique({
        where: { partnerId_variantId: { partnerId: user.partnerId, variantId } },
      });
      const stockReserved = existing?.stockReserved ?? 0;
      if (stockAvailable < stockReserved) {
        return { kind: "reserved" as const, stockReserved };
      }

      const row = await tx.partnerInventory.upsert({
        where: { partnerId_variantId: { partnerId: user.partnerId, variantId } },
        update: { stockAvailable },
        create: {
          partnerId: user.partnerId,
          variantId,
          stockAvailable,
          stockReserved: 0,
        },
      });

      await tx.inventoryLedger.create({
        data: {
          partnerId: user.partnerId,
          variantId,
          reason: "MANUAL_ADJUSTMENT",
          quantityAvailableDelta: stockAvailable - (existing?.stockAvailable ?? 0),
          quantityReservedDelta: 0,
          notes: "Partner dashboard stock edit",
        },
      });

      return { kind: "ok" as const, row };
    });

    if (updated.kind === "missing") return apiBadRequest("المتغير غير موجود");
    if (updated.kind === "reserved") {
      return apiBadRequest(`لا يمكن أن يكون المخزون أقل من المحجوز (${updated.stockReserved})`);
    }
    return apiSuccess(updated.row);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
