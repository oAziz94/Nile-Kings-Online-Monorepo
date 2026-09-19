import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { variantSlug, buildVariantSku } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import { revalidateCatalog } from "@/lib/cache/catalog-tags";

type Params = Promise<{ id: string }>;

/**
 * PATCH /api/admin/variants/[id] — backlog 9.8b: the "مقاسات لون «X»" row save. Accepts
 * `active` (colour-visibility toggle, per-row too since the colour panel's toggle just calls
 * this for every variant sharing the colour) in addition to the existing fields.
 *
 * Stock guard (06-admin-v2.md §3.5, backlog 9.8b/9.9): a body's `stockAvailable`/
 * `stockReserved`, if present, are silently ignored — the type below never destructures them
 * (and the columns no longer exist on `Variant` at all), so a legacy caller sending them
 * writes nothing. Covered by a dedicated e2e assertion.
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
  const { id } = await params;
  const existing = await prisma.variant.findUnique({ where: { id }, include: { product: true } });
  if (!existing) return apiNotFound("المتغير غير موجود");

  let body: {
    name?: string;
    colorHex?: string | null;
    colorName?: string | null;
    imageUrl?: string | null;
    basePricePiastres?: number | null;
    pricePiastres?: number;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const name = body.name !== undefined ? body.name.trim() : undefined;
  const colorName = body.colorName !== undefined ? (body.colorName?.trim() || null) : undefined;
  let newSku: string | undefined;
  let newSlug: string | undefined;
  const sizePart = (name ?? existing.name).trim();
  if (name !== undefined || colorName !== undefined) {
    newSku = buildVariantSku(existing.product.slug, sizePart, colorName ?? existing.colorName, existing.colorHex);
    const conflict = await prisma.variant.findFirst({ where: { sku: newSku, id: { not: id } } });
    if (conflict) return apiConflict("متغير بنفس المقاس واللون موجود مسبقاً");
  }
  if (name !== undefined || colorName !== undefined || body.colorHex !== undefined) {
    newSlug = variantSlug(existing.product.slug, sizePart, body.colorHex ?? existing.colorHex ?? null);
    const slugConflict = await prisma.variant.findFirst({ where: { slug: newSlug, id: { not: id } } });
    if (slugConflict) return apiConflict("متغير بنفس الرابط (slug) موجود مسبقاً");
  }

  const variant = await prisma.variant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(body.colorHex !== undefined && { colorHex: body.colorHex?.trim() || null }),
      ...(colorName !== undefined && { colorName }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl?.trim() || null }),
      ...(newSku !== undefined && { sku: newSku }),
      ...(newSlug !== undefined && { slug: newSlug }),
      ...(body.basePricePiastres !== undefined && { basePricePiastres: body.basePricePiastres == null || (typeof body.basePricePiastres === "number" && body.basePricePiastres >= 0) ? body.basePricePiastres : undefined }),
      ...(typeof body.pricePiastres === "number" && body.pricePiastres >= 0 && { pricePiastres: body.pricePiastres }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });

  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "variant",
    entityId: id,
    entityLabel: variant.sku,
    before: sanitizeForAudit(existing, ["product"]),
    after: sanitizeForAudit(variant),
    ip: requestIp(req),
  });
  revalidateCatalog({ productSlugs: [existing.product.slug] });

  return apiSuccess(variant);
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const v = await prisma.variant.findUnique({ where: { id }, include: { product: { select: { slug: true } } } });
  if (!v) return apiNotFound("المتغير غير موجود");
  // Stock (including reservations) lives only in PartnerInventory now — check across every
  // partner's row for this variant, never a variant-level field.
  const hasReservedStock = await prisma.partnerInventory.findFirst({
    where: { variantId: id, stockReserved: { gt: 0 } },
    select: { id: true },
  });
  if (hasReservedStock) return apiBadRequest("لا يمكن حذف متغير له كمية محجوزة");
  await prisma.variant.delete({ where: { id } });
  await logAdminAction(prisma, {
    actor,
    action: "delete",
    entityType: "variant",
    entityId: id,
    entityLabel: v.sku,
    before: sanitizeForAudit(v, ["product"]),
    ip: requestIp(req),
  });
  revalidateCatalog({ productSlugs: [v.product.slug] });
  return apiSuccess({ deleted: true });
}
