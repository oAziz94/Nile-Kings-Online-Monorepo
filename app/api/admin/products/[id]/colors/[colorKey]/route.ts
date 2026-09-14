import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { variantSlug, buildVariantSku } from "@/lib/admin/slug";
import { apiSuccess, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { splitColorKey } from "@/lib/admin/variant-images";

type Params = Promise<{ id: string; colorKey: string }>;

/**
 * PATCH /api/admin/products/[id]/colors/[colorKey] — backlog 9.8b colour panel: `اسم اللون`,
 * `الكود`, `مرئي في المتجر`. Body `{ colorName?, colorHex?, active? }`. `active` toggles every
 * variant sharing the colour together (the ownership rule's "colour visibility" — `06-admin-
 * v2.md` §3.5); renaming regenerates each variant's SKU/slug (same generator as everywhere
 * else) and re-keys its `VariantImage` gallery rows to the new `colorKey`.
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: productId, colorKey: rawColorKey } = await params;
  const colorKey = decodeURIComponent(rawColorKey);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return apiNotFound("المنتج غير موجود");

  const { colorName: currentName, colorHex: currentHex } = splitColorKey(colorKey);
  const variants = await prisma.variant.findMany({ where: { productId, colorName: currentName, colorHex: currentHex } });
  if (variants.length === 0) return apiNotFound("اللون غير موجود في هذا المنتج");

  const body = await req.json().catch(() => null);
  const nextActive: unknown = body?.active;
  const nextColorName: unknown = body?.colorName;
  const nextColorHex: unknown = body?.colorHex;

  if (typeof nextActive === "boolean") {
    const before = variants[0].active;
    await prisma.variant.updateMany({ where: { productId, colorName: currentName, colorHex: currentHex }, data: { active: nextActive } });
    // `colorName` goes on `after` only (9.5 ruling): `logAdminAction`'s `auditDiff` strips any
    // key whose value is unchanged between `before`/`after` — putting `colorName` on both sides
    // would strip it (it never changes here), leaving `describeAdminAudit` with no colour name
    // to build "أخفى لون <name> من <product>" from. A key present on only one side always
    // survives the diff, so `after`-only keeps it.
    await logAdminAction(prisma, {
      actor,
      action: "color_visibility",
      entityType: "product",
      entityId: productId,
      entityLabel: product.name,
      before: { active: before },
      after: { active: nextActive, colorName: currentName },
      ip: requestIp(req),
    });
  }

  if (typeof nextColorName === "string" || typeof nextColorHex === "string" || nextColorHex === null) {
    const newName = typeof nextColorName === "string" ? nextColorName.trim() || null : currentName;
    const newHex = typeof nextColorHex === "string" ? (nextColorHex.trim() || null) : nextColorHex === null ? null : currentHex;

    const plan = variants.map((v) => ({
      id: v.id,
      sku: buildVariantSku(product.slug, v.name, newName, newHex),
      slug: variantSlug(product.slug, v.name, newHex),
    }));
    const conflict = await prisma.variant.findMany({
      where: {
        id: { notIn: plan.map((p) => p.id) },
        OR: [{ sku: { in: plan.map((p) => p.sku) } }, { slug: { in: plan.map((p) => p.slug) } }],
      },
      select: { id: true },
    });
    if (conflict.length > 0) return apiConflict("الاسم/الكود الجديد يتعارض مع متغير آخر");

    const newColorKey = `${newName ?? ""}|${newHex ?? ""}`;
    await prisma.$transaction(async (tx) => {
      for (const p of plan) {
        await tx.variant.update({ where: { id: p.id }, data: { colorName: newName, colorHex: newHex, sku: p.sku, slug: p.slug } });
      }
      if (newColorKey !== colorKey) {
        await tx.variantImage.updateMany({ where: { productId, colorKey }, data: { colorKey: newColorKey } });
      }
    });

    await logAdminAction(prisma, {
      actor,
      action: "color_rename",
      entityType: "product",
      entityId: productId,
      entityLabel: product.name,
      before: { colorName: currentName, colorHex: currentHex },
      after: { colorName: newName, colorHex: newHex },
      ip: requestIp(req),
    });

    return apiSuccess({ productId, colorKey: newColorKey });
  }

  return apiSuccess({ productId, colorKey });
}
