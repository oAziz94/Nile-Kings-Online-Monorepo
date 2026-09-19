import { cache as reactCache } from "react";
import { getProductIdsRankedByRecentSales } from "@/lib/products/ranked-listing";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ProductPageContent } from "./product-page-content";
import {
  piastresToEgp,
  discountPercentFromPrices,
  originalPriceFromExplicitDiscount,
  originalPriceFromVariant,
  buildProductListItem,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import {
  applyPartnerStockOverrides,
  getCurrentStorefrontStockContext,
  getPartnerStockOverrides,
  type StorefrontStockContext,
} from "@/lib/storefront-location";
import { CATALOG_TAG, productTag } from "@/lib/cache/catalog-tags";

/** The page still reads the governorate cookie to price/stock per partner, so it can't be
 *  fully static — but the DB round trip below is cached, so that per-request cost is only
 *  a cheap partner-stock lookup instead of the whole product+variants query. */
export const dynamic = "force-dynamic";

/**
 * Cached across requests, keyed by slug only (no partnerId) — the expensive product/variant
 * query runs at most once per revalidate window. Partner stock overrides are applied
 * separately, after the cache read, so they always reflect the current visitor.
 */
// The cache is keyed (and tagged) per slug, so it's created inside a function rather than once
// at module scope — `productTag(slug)` needs the slug to build the per-product tag, and
// `unstable_cache`'s own key array already needs the slug too. The persistent Data Cache entry
// is identified by the key array, not by this wrapper's identity, so re-creating the wrapper on
// every call is safe.
function getProductRowCatalog(slug: string) {
  return unstable_cache(
    async () => {
    // Resolve by variant slug first (productSlug_size_colorHexCode), then by product slug.
    // Hardening approved in `04-decisions.md` 2026-09-12 decision 7 / `products-pdp.md` edge
    // case: the variant-slug path must also require the parent product to be active, otherwise
    // a direct link to a variant of a deactivated product would bypass the product-slug path's
    // own `active: true` filter and still render.
    const variantBySlug = await prisma.variant.findFirst({
      where: { slug, active: true, product: { active: true } },
      include: {
        product: {
          include: {
            category: { select: { slug: true, name: true } },
            // backlog 9.8b — an inactive colour ("مرئي في المتجر" off) is hidden from the PDP;
            // every variant of that colour is inactive together, so filtering the variant list
            // is enough to make the whole colour disappear from the chooser.
            variants: {
              where: { active: true },
              select: {
                id: true,
                sku: true,
                slug: true,
                name: true,
                basePricePiastres: true,
                pricePiastres: true,
                colorHex: true,
                colorName: true,
                imageUrl: true,
              },
              orderBy: { name: "asc" },
            },
            variantImages: {
              select: { colorKey: true, url: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });
    const productRow = variantBySlug?.product
      ? variantBySlug.product
      : await prisma.product.findFirst({
        where: { slug, active: true },
        include: {
          category: { select: { slug: true, name: true } },
          variants: {
            where: { active: true },
            select: {
              id: true,
              sku: true,
              slug: true,
              name: true,
              basePricePiastres: true,
              pricePiastres: true,
              colorHex: true,
              colorName: true,
              imageUrl: true,
            },
            orderBy: { name: "asc" },
          },
          variantImages: {
            select: { colorKey: true, url: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
    if (!productRow) return null;

      return { productRow, initialVariantId: variantBySlug?.id ?? null };
    },
    ["product-detail-by-slug", slug],
    { revalidate: 60, tags: [CATALOG_TAG, productTag(slug)] }
  )();
}

/** Memoized per-request so generateMetadata and the page share one call. */
const getProductRow = reactCache(async (slug: string, partnerId: string | null) => {
  const cached = await getProductRowCatalog(slug);
  if (!cached) return null;

  const overrides = await getPartnerStockOverrides(
    cached.productRow.variants.map((v) => v.id),
    partnerId
  );
  // Placeholder 0, always replaced by the override above — stock lives only in
  // PartnerInventory now (backlog 9.9); a governorate with no covering partner stays 0.
  const variants = applyPartnerStockOverrides(
    cached.productRow.variants.map((v) => ({ ...v, stockAvailable: 0 })),
    overrides
  );
  return { productRow: cached.productRow, variants, initialVariantId: cached.initialVariantId };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stockContext = await getCurrentStorefrontStockContext();
  const row = await getProductRow(slug, stockContext.partnerId);
  if (!row) return { title: "منتج | قطن ملوك النيل" };
  const product = row.productRow;
  const desc = product.description
    ? product.description.slice(0, 160).replace(/\n/g, " ")
    : undefined;
  return pageMetadata({
    title: product.name,
    description: desc ?? `اشتري ${product.name} من قطن ملوك النيل`,
    path: `products/${slug}`,
    imageUrl: product.imageUrl,
  });
}

async function getProduct(slug: string, partnerId: string | null) {
  const row = await getProductRow(slug, partnerId);
  if (!row) return null;
  const product = { ...row.productRow, variants: row.variants };
  const initialVariantId = row.initialVariantId;

  const prices = product.variants.map((v) => v.pricePiastres);
  const minP = prices.length ? Math.min(...prices) : 0;
  const currentPiastres = product.discountPricePiastres ?? minP;
  const priceEgp = piastresToEgp(currentPiastres);
  const originalPriceEgp = originalPriceFromExplicitDiscount(
    product.basePricePiastres,
    product.discountPricePiastres
  );
  const discountPercent = originalPriceEgp != null && originalPriceEgp > priceEgp
    ? discountPercentFromPrices(originalPriceEgp, priceEgp)
    : undefined;

  // Group each colour's gallery photos by the same `colorKey` (`${colorName}|${colorHex}`)
  // `hooks/use-variant-selection.ts` uses to group a colour's size rows — see `VariantImage` in
  // `schema.prisma`. A colour with no rows yet falls back to its single `Variant.imageUrl` in the
  // PDP component, so products not yet given a multi-photo gallery are unaffected.
  const variantGalleries: Record<string, string[]> = {};
  for (const img of product.variantImages) {
    (variantGalleries[img.colorKey] ??= []).push(img.url);
  }

  return {
    id: product.id,
    categoryId: product.categoryId,
    name: product.name,
    slug: product.slug,
    description: product.description,
    imageUrl: product.imageUrl,
    tags: product.tags ?? [],
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    priceEgp,
    originalPriceEgp,
    discountPercent,
    inStock: product.variants.some((v) => v.stockAvailable > 0),
    initialVariantId,
    variantGalleries,
    variants: product.variants.map((v) => {
      const variantPriceEgp = piastresToEgp(v.pricePiastres);
      const variantOriginalPriceEgp = originalPriceFromVariant(v.basePricePiastres, v.pricePiastres);
      const variantDiscountPercent =
        variantOriginalPriceEgp != null
          ? discountPercentFromPrices(variantOriginalPriceEgp, variantPriceEgp)
          : undefined;
      return {
        id: v.id,
        sku: v.sku,
        slug: v.slug,
        name: v.name,
        priceEgp: variantPriceEgp,
        originalPriceEgp: variantOriginalPriceEgp,
        discountPercent: variantDiscountPercent,
        stockAvailable: v.stockAvailable,
        inStock: v.stockAvailable > 0,
        colorHex: v.colorHex,
        colorName: v.colorName,
        imageUrl: v.imageUrl,
      };
    }),
  };
}

const RELATED_LIMIT = 4;

/**
 * "قد يعجبك" — user direction 2026-09-12: not "the same category by sortOrder" but the same demand
 * rule the home rails and the listing's best-sales sort use (units sold in the last 30 days, then
 * newest), taken from the product's own category first and topped up from the rest of the
 * catalog when the category has fewer than four other products. The current product is excluded.
 */
const getRelatedCatalog = unstable_cache(
  async (slug: string, categoryId: string) => {
    const include = {
      category: { select: { slug: true, name: true } },
      variants: {
        select: {
          id: true,
          slug: true,
          pricePiastres: true,
          colorHex: true,
          colorName: true,
          imageUrl: true,
          createdAt: true,
        },
      },
    } as const;
    const sameCategory = await getProductIdsRankedByRecentSales({ active: true, categoryId, slug: { not: slug } });
    let ids = sameCategory.slice(0, RELATED_LIMIT);
    if (ids.length < RELATED_LIMIT) {
      const rest = await getProductIdsRankedByRecentSales({ active: true, categoryId: { not: categoryId } });
      ids = [...ids, ...rest.slice(0, RELATED_LIMIT - ids.length)];
    }
    if (ids.length === 0) return [];
    const rows = await prisma.product.findMany({ where: { id: { in: ids } }, include });
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    return ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => r != null);
  },
  ["product-detail-related"],
  { revalidate: 300, tags: [CATALOG_TAG] }
);

async function getRelated(slug: string, categoryId: string, stockContext: StorefrontStockContext) {
  const related = await getRelatedCatalog(slug, categoryId);

  const allVariantIds = related.flatMap((p) => p.variants.map((v) => v.id));
  const overrides = await getPartnerStockOverrides(allVariantIds, stockContext.partnerId);
  const stockAdjustedRelated = related.map((product) => ({
    ...product,
    variants: applyPartnerStockOverrides(
      product.variants.map((v) => ({ ...v, stockAvailable: 0 })),
      overrides
    ),
  }));

  return stockAdjustedRelated.map(buildProductListItem);
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stockContext = await getCurrentStorefrontStockContext();
  const product = await getProduct(slug, stockContext.partnerId);
  if (!product) notFound();

  const related = await getRelated(product.slug, product.categoryId, stockContext);

  return (
    <div className="container px-4 py-6 md:py-8">
      <ProductPageContent product={product} related={related} initialVariantId={product.initialVariantId} />
    </div>
  );
}
