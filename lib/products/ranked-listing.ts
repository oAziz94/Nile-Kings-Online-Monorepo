import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const RECENT_SALES_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Ranks every product matching `where` by units sold in the last 30 days (excluding
 * cancelled orders) — same definition used by the Priority Analytics tab in the standalone
 * inventory dashboard, so "best selling" means the same thing in both places. Products with
 * no recent sales are never dropped, just sorted to the tail by newest-first, matching the
 * "fall back to newest" convention already used elsewhere (lib/storefront-data.ts,
 * app/api/products/recommendations/route.ts).
 *
 * Returns the full ranked list of product IDs (not paginated) — the caller slices by
 * offset/limit and re-fetches full records for just that page, since Prisma can't express
 * this ranking as a single declarative `orderBy`.
 */
export async function getProductIdsRankedByRecentSales(where: Prisma.ProductWhereInput): Promise<string[]> {
  const products = await prisma.product.findMany({
    where,
    select: { id: true, createdAt: true, variants: { select: { id: true } } },
  });
  if (products.length === 0) return [];

  const productIdByVariantId = new Map<string, string>();
  const variantIds: string[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      productIdByVariantId.set(variant.id, product.id);
      variantIds.push(variant.id);
    }
  }

  const cutoff = new Date(Date.now() - RECENT_SALES_WINDOW_MS);
  const sold =
    variantIds.length === 0
      ? []
      : await prisma.orderItem.groupBy({
          by: ["variantId"],
          where: {
            variantId: { in: variantIds },
            order: { createdAt: { gte: cutoff }, status: { not: "CANCELLED" } },
          },
          _sum: { quantity: true },
        });

  const soldByProduct = new Map<string, number>();
  for (const row of sold) {
    const productId = productIdByVariantId.get(row.variantId);
    if (!productId) continue;
    soldByProduct.set(productId, (soldByProduct.get(productId) ?? 0) + (row._sum.quantity ?? 0));
  }

  return [...products]
    .sort((a, b) => {
      const soldDiff = (soldByProduct.get(b.id) ?? 0) - (soldByProduct.get(a.id) ?? 0);
      if (soldDiff !== 0) return soldDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((p) => p.id);
}
