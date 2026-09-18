import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { planVariantPriceChanges, type BulkPriceRule } from "@/lib/admin/bulk-edit";

/**
 * POST /api/admin/products/bulk/preview — backlog 9.8b bulk edit's confirm step. Same body as
 * `/apply`, computes but never writes: for each selected product, the category/active/tags
 * change it would receive and (if a price rule was given) every variant's SKU + old -> new
 * price, to the piastre. `/apply` re-derives the identical numbers via the same
 * `planVariantPriceChanges` so what's previewed is exactly what gets written.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
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

  const products = await prisma.product.findMany({
    where: { id: { in: productIds as string[] } },
    include: { category: { select: { id: true, name: true } }, variants: { select: { id: true, sku: true, basePricePiastres: true, pricePiastres: true } } },
  });

  const preview = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    categoryChange: categoryId && categoryId !== p.categoryId ? { fromId: p.categoryId, toId: categoryId } : null,
    activeChange: active !== undefined && active !== p.active ? { from: p.active, to: active } : null,
    tagsAfter:
      tagsAdd.length || tagsRemove.length
        ? Array.from(new Set([...p.tags.filter((t) => !tagsRemove.includes(t)), ...tagsAdd]))
        : null,
    variants: priceRule ? planVariantPriceChanges(p.variants, priceRule) : [],
  }));

  return apiSuccess({ products: preview });
}
