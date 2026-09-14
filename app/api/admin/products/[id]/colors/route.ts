import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { variantSlug, buildVariantSku } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

type Params = Promise<{ id: string }>;

/**
 * POST /api/admin/products/[id]/colors — backlog 9.8b "لون جديد": one dialog creates a colour
 * across the standard size run in one call. Body `{ colorName, colorHex?, sizes: string[],
 * basePricePiastres?, pricePiastres }` — every size becomes a `Variant` row, SKU/slug built by
 * the exact same `buildVariantSku`/`variantSlug` functions the single-size "إضافة مقاس" flow
 * (`app/api/admin/products/[id]/variants/route.ts`) uses, so the two paths can never diverge.
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: productId } = await params;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return apiNotFound("المنتج غير موجود");

  const body = await req.json().catch(() => null);
  const colorName: unknown = body?.colorName;
  const colorHex: unknown = body?.colorHex;
  const sizes: unknown = body?.sizes;
  const basePricePiastres: unknown = body?.basePricePiastres;
  const pricePiastres: unknown = body?.pricePiastres;

  if (typeof colorName !== "string" || !colorName.trim()) return apiBadRequest("اسم اللون مطلوب");
  if (!Array.isArray(sizes) || sizes.length === 0 || sizes.some((s) => typeof s !== "string" || !s.trim())) {
    return apiBadRequest("اختر مقاساً واحداً على الأقل");
  }
  if (typeof pricePiastres !== "number" || pricePiastres < 0) return apiBadRequest("السعر مطلوب ويجب أن يكون غير سالب");
  const base = typeof basePricePiastres === "number" && basePricePiastres >= 0 ? basePricePiastres : null;
  const hex = typeof colorHex === "string" && colorHex.trim() ? colorHex.trim() : null;
  const name = colorName.trim();

  const uniqueSizes = Array.from(new Set(sizes as string[]));
  const plan = uniqueSizes.map((size) => ({
    size,
    sku: buildVariantSku(product.slug, size, name, hex),
    slug: variantSlug(product.slug, size, hex),
  }));

  const skus = plan.map((p) => p.sku);
  const slugs = plan.map((p) => p.slug);
  const conflicts = await prisma.variant.findMany({
    where: { OR: [{ sku: { in: skus } }, { slug: { in: slugs } }] },
    select: { sku: true, slug: true },
  });
  if (conflicts.length > 0) return apiConflict("بعض المقاسات لهذا اللون موجودة مسبقاً");

  const created = await prisma.$transaction(
    plan.map((p) =>
      prisma.variant.create({
        data: {
          productId,
          sku: p.sku,
          slug: p.slug,
          name: p.size,
          colorName: name,
          colorHex: hex,
          basePricePiastres: base,
          pricePiastres,
          stockAvailable: 0,
          stockReserved: 0,
        },
      })
    )
  );

  await logAdminAction(prisma, {
    actor,
    action: "color_add",
    entityType: "product",
    entityId: productId,
    entityLabel: product.name,
    after: { colorName: name, colorHex: hex, sizes: uniqueSizes, pricePiastres },
    ip: requestIp(req),
  });

  return apiSuccess(created);
}
