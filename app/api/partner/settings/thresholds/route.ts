import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * GET/PUT /api/partner/settings/thresholds (backlog 5.1) — `PartnerStockThreshold`
 * overrides read by `lib/partner/resolve-threshold.ts`'s `resolveThreshold()`.
 * GET returns every category with its override (or `null` = inherits the partner
 * default) plus the current product-level overrides (with product/category names for
 * display). PUT replaces the whole set in one transaction — category overrides are a
 * `{ [categoryId]: number | null }` map (null removes the override), product overrides
 * are a full list (`{ productId, threshold }[]`) that replaces whatever existed before.
 */

export async function GET() {
  try {
    const user = await requirePartner();
    const [categories, rows] = await Promise.all([
      prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      prisma.partnerStockThreshold.findMany({
        where: { partnerId: user.partnerId },
        include: {
          product: { select: { id: true, name: true } },
        },
      }),
    ]);

    const categoryThresholdByCategoryId = new Map(
      rows.filter((r) => r.categoryId).map((r) => [r.categoryId as string, r.threshold])
    );

    return apiSuccess({
      categories: categories.map((c) => ({
        categoryId: c.id,
        name: c.name,
        threshold: categoryThresholdByCategoryId.get(c.id) ?? null,
      })),
      productOverrides: rows
        .filter((r) => r.productId && r.product)
        .map((r) => ({
          productId: r.productId as string,
          name: r.product!.name,
          threshold: r.threshold,
        })),
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}

const putSchema = z.object({
  categoryThresholds: z.record(z.string(), z.number().int().min(0).max(999).nullable()).default({}),
  productThresholds: z
    .array(z.object({ productId: z.string().min(1), threshold: z.number().int().min(0).max(999) }))
    .default([]),
});

export async function PUT(req: NextRequest) {
  try {
    const user = await requirePartner();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
    }
    const { categoryThresholds, productThresholds } = parsed.data;

    await prisma.$transaction(async (tx) => {
      for (const [categoryId, threshold] of Object.entries(categoryThresholds)) {
        if (threshold === null) {
          await tx.partnerStockThreshold.deleteMany({
            where: { partnerId: user.partnerId, categoryId },
          });
        } else {
          await tx.partnerStockThreshold.upsert({
            where: { partnerId_categoryId: { partnerId: user.partnerId, categoryId } },
            update: { threshold },
            create: { partnerId: user.partnerId, categoryId, threshold },
          });
        }
      }

      // Product overrides are a full replace-list per PUT (backlog 5.1: "product search to
      // add product overrides") — delete anything not present, upsert what is.
      const keepProductIds = productThresholds.map((p) => p.productId);
      await tx.partnerStockThreshold.deleteMany({
        where: {
          partnerId: user.partnerId,
          productId: { not: null, notIn: keepProductIds.length ? keepProductIds : ["__none__"] },
        },
      });
      for (const { productId, threshold } of productThresholds) {
        await tx.partnerStockThreshold.upsert({
          where: { partnerId_productId: { partnerId: user.partnerId, productId } },
          update: { threshold },
          create: { partnerId: user.partnerId, productId, threshold },
        });
      }
    });

    return apiSuccess({ ok: true }, "تم حفظ حدود المخزون");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
