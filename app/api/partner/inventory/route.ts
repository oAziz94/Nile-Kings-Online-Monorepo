import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { sortVariants } from "@/lib/admin/variant-sort";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { buildThresholdLookup } from "@/lib/partner/resolve-threshold";
import { resolveCoverDays } from "@/lib/partner/stock-cover";

async function requireInventoryPartner() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { id: true, name: true, phone: true, partnerType: true, governorate: true, lowStockThreshold: true },
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
    // Backlog 4.18 (allowed API change): `lowStock=1` filters to products with any variant
    // at/below this partner's own `lowStockThreshold` (user decision 2026-09-12, per-partner
    // default 5) — distinct from the pre-existing, currently-unused `lowOnly` param above
    // (hardcoded `<= 3`), which is left byte-for-byte untouched per the standing rule.
    const lowStock = searchParams.get("lowStock") === "1";
    // Backlog 5.4 (allowed additive API change): the stock hub's "نفد" chip — products with
    // at least one variant at zero sellable.
    const outOfStock = searchParams.get("outOfStock") === "1";
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

    // Backlog 5.4 (allowed additive API change, rule 13): threshold and days-of-cover per
    // variant, resolved through `buildThresholdLookup()` (the pure core `resolveThreshold()`
    // wraps) — no screen compares against `Partner.lowStockThreshold` directly any more.
    // Built from the `partner` row `requireInventoryPartner()` already fetched above (rather
    // than calling `resolveThreshold()`, which would re-fetch the same partner row via
    // `findUniqueOrThrow` — a second, redundant existence check with nothing to gain and one
    // more way for a transient race to surface as a 500 on an otherwise-successful request).
    const thresholdRows = await prisma.partnerStockThreshold.findMany({
      where: { partnerId: user.partnerId },
      select: { categoryId: true, productId: true, threshold: true },
    });
    const thresholdLookup = buildThresholdLookup(partner.lowStockThreshold, thresholdRows);
    const preRows = products.map((product) => ({
      ...product,
      variants: sortVariants(product.variants).map((variant) => {
        const inventory = variant.partnerInventories[0] ?? null;
        const stockAvailable = inventory?.stockAvailable ?? 0;
        const stockReserved = inventory?.stockReserved ?? 0;
        const sellable = Math.max(0, stockAvailable - stockReserved);
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
          sellable,
          updatedAt: inventory?.updatedAt ?? null,
          threshold: thresholdLookup.forVariant({ productId: product.id, categoryId: product.category.id }),
        };
      }),
    }));

    const allVariantRows = preRows.flatMap((product) =>
      product.variants.map((variant) => ({ variantId: variant.id, sellable: variant.sellable }))
    );
    const coverByVariant = await resolveCoverDays(user.partnerId, allVariantRows);

    const rows = preRows
      .map((product) => ({
        ...product,
        variants: product.variants.map((variant) => ({
          ...variant,
          coverDays: coverByVariant.get(variant.id) ?? null,
        })),
      }))
      .filter((product) => !lowOnly || product.variants.some((variant) => variant.sellable <= variant.threshold))
      .filter(
        (product) => !lowStock || product.variants.some((variant) => variant.sellable <= variant.threshold)
      )
      .filter((product) => !outOfStock || product.variants.some((variant) => variant.sellable === 0));

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
    let body: { variantId?: string; stockAvailable?: number; delta?: number };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const variantId = body.variantId?.trim();
    if (!variantId) return apiBadRequest("variantId مطلوب");

    const stockAvailableInput = body.stockAvailable;
    const deltaInput = body.delta;
    const hasStockAvailable = stockAvailableInput !== undefined;
    const hasDelta = deltaInput !== undefined;

    // Backlog 4.18 (allowed API change): quick-adjust sends `delta` instead of a
    // client-computed total; exactly one of the two must be present so no request can
    // accidentally race a stale `stockAvailable` against an intended `delta`, or supply
    // neither and silently no-op.
    if (hasStockAvailable === hasDelta) {
      return apiBadRequest("أرسل قيمة واحدة فقط: stockAvailable أو delta");
    }

    if (hasStockAvailable) {
      if (
        typeof stockAvailableInput !== "number" ||
        !Number.isInteger(stockAvailableInput) ||
        stockAvailableInput < 0
      ) {
        return apiBadRequest("المخزون يجب أن يكون رقماً صحيحاً موجباً");
      }
    } else {
      if (typeof deltaInput !== "number" || !Number.isInteger(deltaInput)) {
        return apiBadRequest("قيمة التعديل يجب أن تكون رقماً صحيحاً");
      }
    }

    // Verifier finding (4.18, 2026-09-12): a plain read → compute → upsert lost one of two
    // concurrent `delta` adjustments while still writing a ledger row for both. The row is now
    // locked (`SELECT … FOR UPDATE`, the same pattern `lib/inventory/restock-requests.ts` uses)
    // for the whole read-compute-write, so concurrent edits serialise and the ledger always
    // matches the stock. A never-stocked variant is first materialised as 0/0 so it can be
    // locked; a rejected edit throws so that row (and nothing else) rolls back.
    class ReservedFloorError extends Error {
      constructor(public readonly stockReserved: number) {
        super("reserved");
      }
    }

    let updated: { kind: "missing" } | { kind: "reserved"; stockReserved: number } | { kind: "ok"; row: unknown };
    try {
      updated = await prisma.$transaction(async (tx) => {
        const variant = await tx.variant.findUnique({
          where: { id: variantId },
          select: { id: true, sku: true },
        });
        if (!variant) return { kind: "missing" as const };

        await tx.partnerInventory.upsert({
          where: { partnerId_variantId: { partnerId: user.partnerId, variantId } },
          update: {},
          create: { partnerId: user.partnerId, variantId, stockAvailable: 0, stockReserved: 0 },
        });
        const [locked] = await tx.$queryRaw<{ stockAvailable: number; stockReserved: number }[]>`
          SELECT "stockAvailable", "stockReserved"
          FROM "PartnerInventory"
          WHERE "partnerId" = ${user.partnerId} AND "variantId" = ${variantId}
          FOR UPDATE
        `;
        const stockReserved = locked.stockReserved;
        const previousStockAvailable = locked.stockAvailable;
        const stockAvailable = hasStockAvailable
          ? (stockAvailableInput as number)
          : previousStockAvailable + (deltaInput as number);

        if (stockAvailable < stockReserved) {
          throw new ReservedFloorError(stockReserved);
        }

        const row = await tx.partnerInventory.update({
          where: { partnerId_variantId: { partnerId: user.partnerId, variantId } },
          data: { stockAvailable },
        });

      await tx.inventoryLedger.create({
        data: {
          partnerId: user.partnerId,
          variantId,
          reason: "MANUAL_ADJUSTMENT",
          quantityAvailableDelta: stockAvailable - previousStockAvailable,
          quantityReservedDelta: 0,
          notes: "Partner dashboard stock edit",
        },
      });

        return { kind: "ok" as const, row };
      });
    } catch (error) {
      if (error instanceof ReservedFloorError) {
        updated = { kind: "reserved", stockReserved: error.stockReserved };
      } else {
        throw error;
      }
    }

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
