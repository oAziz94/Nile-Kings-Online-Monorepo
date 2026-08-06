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
  getCurrentStorefrontStockContext,
  type StorefrontStockContext,
} from "@/lib/storefront-location";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const variant = await prisma.variant.findFirst({
    where: { slug },
    select: { productId: true, product: { select: { name: true, description: true, imageUrl: true } } },
  });
  const product = variant?.product ?? await prisma.product.findFirst({
    where: { slug, active: true },
    select: { name: true, description: true, imageUrl: true },
  });
  if (!product) return { title: "منتج | نايل كينجز" };
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

async function getProduct(slug: string, stockContext: StorefrontStockContext) {
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
  const product = {
    ...productRow,
    variants: await applyStorefrontPartnerStock(productRow.variants, stockContext.partnerId),
  };
  const initialVariantId = variantBySlug?.id ?? null;

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

  const stockAdjustedRelated = await Promise.all(
    related.map(async (product) => ({
      ...product,
      variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
    }))
  );

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
  const product = await getProduct(slug, stockContext);
  if (!product) notFound();

  const related = await getRelated(product.slug, product.categoryId, stockContext);

  return (
    <div className="container px-4 py-6 md:py-8">
      <ProductPageContent product={product} related={related} initialVariantId={product.initialVariantId} />
    </div>
  );
}
