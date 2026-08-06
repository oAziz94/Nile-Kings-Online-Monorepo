import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiNotFound } from "@/lib/api/response";
import type { ProductDetail } from "@/lib/catalog";
import {
  piastresToEgp,
  discountPercentFromPrices,
  originalPriceFromExplicitDiscount,
  originalPriceFromVariant,
} from "@/lib/catalog";
import {
  applyStorefrontPartnerStock,
  getStorefrontGovernorateFromRequest,
  getStorefrontStockContext,
} from "@/lib/storefront-location";

export const dynamic = "force-dynamic";

function toDetail(p: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: {
    id: string;
    sku: string;
    slug: string | null;
    name: string;
    basePricePiastres: number | null;
    pricePiastres: number;
    stockAvailable: number;
    colorHex: string | null;
    colorName: string | null;
    imageUrl: string | null;
  }[];
}): ProductDetail {
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
  const inStock = p.variants.some((v) => v.stockAvailable > 0);

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    imageUrl: p.imageUrl,
    priceEgp,
    ...(originalPriceEgp && originalPriceEgp > priceEgp && { originalPriceEgp }),
    ...(discountPercent != null && { discountPercent }),
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    inStock,
    tags: p.tags ?? [],
    variants: p.variants.map((v) => {
      const variantPriceEgp = piastresToEgp(v.pricePiastres);
      const variantOriginalPriceEgp = originalPriceFromVariant(v.basePricePiastres, v.pricePiastres);
      const variantDiscountPercent =
        variantOriginalPriceEgp != null
          ? discountPercentFromPrices(variantOriginalPriceEgp, variantPriceEgp)
          : undefined;
      return {
        id: v.id,
        sku: v.sku,
        name: v.name,
        slug: v.slug,
        imageUrl: v.imageUrl,
        priceEgp: variantPriceEgp,
        ...(variantOriginalPriceEgp && { originalPriceEgp: variantOriginalPriceEgp }),
        ...(variantDiscountPercent != null && { discountPercent: variantDiscountPercent }),
        stockAvailable: v.stockAvailable,
        inStock: v.stockAvailable > 0,
        colorHex: v.colorHex,
        colorName: v.colorName,
      };
    }),
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const stockContext = await getStorefrontStockContext(getStorefrontGovernorateFromRequest(req));

  const product = await prisma.product.findFirst({
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

  if (!product) return apiNotFound("المنتج غير موجود");

  const adjustedProduct = {
    ...product,
    variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
  };

  return apiSuccess(toDetail(adjustedProduct));
}
