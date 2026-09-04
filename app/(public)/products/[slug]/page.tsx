import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { ProductPageContent } from "./product-page-content";
import {
  piastresToEgp,
  discountPercentFromPrices,
  originalPriceFromExplicitDiscount,
  originalPriceFromVariant,
} from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import {
  applyStorefrontPartnerStock,
  applyPartnerStockOverrides,
  getCurrentStorefrontStockContext,
  getPartnerStockOverrides,
  type StorefrontStockContext,
} from "@/lib/storefront-location";

export const dynamic = "force-dynamic";

/**
 * Cached per-request (keyed by slug + partnerId, both primitives) so generateMetadata and the
 * page component share one DB round trip instead of each fetching the product independently.
 */
const getProductRow = cache(async (slug: string, partnerId: string | null) => {
  // Resolve by variant slug first (productSlug_size_colorHexCode), then by product slug
  const variantBySlug = await prisma.variant.findFirst({
    where: { slug },
    include: {
      product: {
        include: {
          category: { select: { slug: true, name: true } },
          variants: {
            select: {
              id: true,
              sku: true,
              slug: true,
              name: true,
              basePricePiastres: true,
              pricePiastres: true,
              stockAvailable: true,
              colorHex: true,
              colorName: true,
              imageUrl: true,
            },
            orderBy: { name: "asc" },
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
          select: {
            id: true,
            sku: true,
            slug: true,
            name: true,
            basePricePiastres: true,
            pricePiastres: true,
            stockAvailable: true,
            colorHex: true,
            colorName: true,
            imageUrl: true,
          },
          orderBy: { name: "asc" },
        },
      },
    });
  if (!productRow) return null;

  const variants = await applyStorefrontPartnerStock(productRow.variants, partnerId);
  return { productRow, variants, initialVariantId: variantBySlug?.id ?? null };
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stockContext = await getCurrentStorefrontStockContext();
  const row = await getProductRow(slug, stockContext.partnerId);
  if (!row) return { title: "منتج | نايل كينجز" };
  const product = row.productRow;
  const desc = product.description
    ? product.description.slice(0, 160).replace(/\n/g, " ")
    : undefined;
  return pageMetadata({
    title: product.name,
    description: desc ?? `اشتري ${product.name} من نايل كينجز`,
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

async function getRelated(slug: string, categoryId: string, stockContext: StorefrontStockContext) {
  const related = await prisma.product.findMany({
    where: { active: true, categoryId, slug: { not: slug } },
    orderBy: { sortOrder: "asc" },
    take: 4,
    include: {
      category: { select: { slug: true, name: true } },
      variants: {
        select: {
          id: true,
          pricePiastres: true,
          stockAvailable: true,
          colorHex: true,
          colorName: true,
          imageUrl: true,
        },
      },
    },
  });

  const allVariantIds = related.flatMap((p) => p.variants.map((v) => v.id));
  const overrides = await getPartnerStockOverrides(allVariantIds, stockContext.partnerId);
  const stockAdjustedRelated = related.map((product) => ({
    ...product,
    variants: applyPartnerStockOverrides(product.variants, overrides),
  }));

  return stockAdjustedRelated.map((p) => {
    const prices = p.variants.map((v) => v.pricePiastres);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const currentPiastres = p.discountPricePiastres ?? minPrice;
    const priceEgp = piastresToEgp(currentPiastres);
    const originalPriceEgp = originalPriceFromExplicitDiscount(
      p.basePricePiastres,
      p.discountPricePiastres
    );
    const discountPercent = originalPriceEgp != null && originalPriceEgp > priceEgp
      ? discountPercentFromPrices(originalPriceEgp, priceEgp)
      : undefined;
    const seen = new Set<string>();
    const colorVariants: { id: string; colorHex: string | null; colorName: string | null; imageUrl: string | null }[] = [];
    for (const v of p.variants) {
      const key = v.colorHex ?? "default";
      if (seen.has(key)) continue;
      seen.add(key);
      colorVariants.push({
        id: v.id,
        colorHex: v.colorHex,
        colorName: v.colorName,
        imageUrl: v.imageUrl ?? p.imageUrl,
      });
    }
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      imageUrl: p.imageUrl,
      priceEgp,
      originalPriceEgp: originalPriceEgp && originalPriceEgp > priceEgp ? originalPriceEgp : undefined,
      discountPercent,
      inStock: p.variants.some((v) => v.stockAvailable > 0),
      colorVariants: colorVariants.length > 0 ? colorVariants : undefined,
    };
  });
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
