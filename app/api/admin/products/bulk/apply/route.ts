import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { planVariantPriceChanges, type BulkPriceRule } from "@/lib/admin/bulk-edit";
import { revalidateCatalog } from "@/lib/cache/catalog-tags";

/**
 * POST /api/admin/products/bulk/apply — backlog 9.8b bulk edit's confirm. Same body/shape as
 * `/preview`; writes every selected product (category/active/tags) and its variants' prices in
 * one transaction, then one `AdminAuditLog` row per product (action `bulk_edit`, before/after
 * restricted to the product-level fields that actually changed — the variant price deltas ride
 * along in `after.priceRule`/`after.variantsPriced` for traceability without bloating the row).
 */
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const body = await req.json().catch(() => null);
  const productIds: unknown = body?.productIds;
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.some((x) => typeof x !== "string")) {
    return apiBadRequest("اختر منتجاً واحداً على الأقل");
  }
  const categoryId: string | undefined = typeof body?.categoryId === "string" ? body.categoryId : undefined;
  const active: boolean | undefined = typeof body?.active === "boolean" ? body.active : undefined;
  const tagsAdd: string[] = Array.isArray(body?.tagsAdd) ? body.tagsAdd.filter((t: unknown) => typeof t === "string") : [];
  const tagsRemove: string[] = Array.isArray(body?.tagsRemove) ? body.tagsRemove.filter((t: unknown) => typeof t === "string") : [];
  const priceRule: BulkPriceRule | undefined =
    body?.price && typeof body.price.value === "number" && ["base", "selling", "both"].includes(body.price.field) && ["amount", "percent"].includes(body.price.mode)
      ? { field: body.price.field, mode: body.price.mode, value: body.price.value }
      : undefined;

  if (categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) return apiBadRequest("الفئة غير موجودة");
  }
  if (!categoryId && active === undefined && tagsAdd.length === 0 && tagsRemove.length === 0 && !priceRule) {
    return apiBadRequest("لم يتم اختيار أي تعديل");
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds as string[] } },
    include: { variants: { select: { id: true, sku: true, basePricePiastres: true, pricePiastres: true } } },
  });

  const results = await prisma.$transaction(async (tx) => {
    const rows: { productId: string; before: Record<string, unknown>; after: Record<string, unknown>; label: string }[] = [];
    for (const p of products) {
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const data: { categoryId?: string; active?: boolean; tags?: string[] } = {};

      if (categoryId && categoryId !== p.categoryId) {
        before.categoryId = p.categoryId;
        after.categoryId = categoryId;
        data.categoryId = categoryId;
      }
      if (active !== undefined && active !== p.active) {
        before.active = p.active;
        after.active = active;
        data.active = active;
      }
      if (tagsAdd.length || tagsRemove.length) {
        const nextTags = Array.from(new Set([...p.tags.filter((t) => !tagsRemove.includes(t)), ...tagsAdd]));
        if (JSON.stringify(nextTags) !== JSON.stringify(p.tags)) {
          before.tags = p.tags;
          after.tags = nextTags;
          data.tags = nextTags;
        }
      }
      if (Object.keys(data).length > 0) {
        await tx.product.update({ where: { id: p.id }, data });
      }

      let variantsPriced: ReturnType<typeof planVariantPriceChanges> = [];
      if (priceRule) {
        variantsPriced = planVariantPriceChanges(p.variants, priceRule);
        for (const v of variantsPriced) {
          if (v.newBasePricePiastres === v.oldBasePricePiastres && v.newPricePiastres === v.oldPricePiastres) continue;
          await tx.variant.update({
            where: { id: v.id },
            data: {
              ...(v.newBasePricePiastres !== v.oldBasePricePiastres && { basePricePiastres: v.newBasePricePiastres }),
              ...(v.newPricePiastres !== v.oldPricePiastres && { pricePiastres: v.newPricePiastres }),
            },
          });
        }
        after.priceRule = priceRule;
        after.variantsPriced = variantsPriced.filter((v) => v.newBasePricePiastres !== v.oldBasePricePiastres || v.newPricePiastres !== v.oldPricePiastres);
      }

      if (Object.keys(before).length > 0 || Object.keys(after).length > 0) {
        rows.push({ productId: p.id, before, after, label: p.name });
      }
    }
    return rows;
  });

  for (const row of results) {
    await logAdminAction(prisma, {
      actor,
      action: "bulk_edit",
      entityType: "product",
      entityId: row.productId,
      entityLabel: row.label,
      before: row.before,
      after: row.after,
      ip: requestIp(req),
    });
  }

  if (results.length > 0) {
    revalidateCatalog({ productSlugs: products.map((p) => p.slug) });
  }

  return apiSuccess({ updated: results.length });
}
