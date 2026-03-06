import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiNotFound } from "@/lib/api/response";
import type { ProductDetail } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices } from "@/lib/catalog";

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
    name: string;
    pricePiastres: number;
    stockAvailable: number;
    colorHex: string | null;
    colorName: string | null;
  }[];
}): ProductDetail {
  const prices = p.variants.map((v) => v.pricePiastres);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const currentPiastres = p.discountPricePiastres ?? minPrice;
  const priceEgp = piastresToEgp(currentPiastres);
  const originalFromProduct = p.basePricePiastres != null && p.basePricePiastres > currentPiastres
    ? piastresToEgp(p.basePricePiastres)
    : undefined;
  const originalFromVariants = maxPrice > minPrice ? piastresToEgp(maxPrice) : undefined;
  const originalPriceEgp = originalFromProduct ?? originalFromVariants;
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
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      priceEgp: piastresToEgp(v.pricePiastres),
      stockAvailable: v.stockAvailable,
      inStock: v.stockAvailable > 0,
      colorHex: v.colorHex,
      colorName: v.colorName,
    })),
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const product = await prisma.product.findFirst({
    where: { slug, active: true },
    include: {
      category: { select: { slug: true, name: true } },
      variants: {
        select: {
          id: true,
          sku: true,
          name: true,
          pricePiastres: true,
          stockAvailable: true,
          colorHex: true,
          colorName: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!product) return apiNotFound("المنتج غير موجود");

  return apiSuccess(toDetail(product));
}
