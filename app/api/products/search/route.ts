import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductListItem, ColorVariantListItem } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices } from "@/lib/catalog";

export const dynamic = "force-dynamic";

function toListItem(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: {
    id: string;
    pricePiastres: number;
    stockAvailable: number;
    colorHex: string | null;
    colorName: string | null;
    imageUrl: string | null;
  }[];
}): ProductListItem {
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

  const seen = new Set<string>();
  const colorVariants: ColorVariantListItem[] = [];
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
    ...(originalPriceEgp && originalPriceEgp > priceEgp && { originalPriceEgp }),
    ...(discountPercent != null && { discountPercent }),
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    inStock,
    ...(colorVariants.length > 0 && { colorVariants }),
  };
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit")) || 24, 48);

  if (!q) {
    return apiSuccess({ products: [], total: 0 });
  }

  const words = q.split(/\s+/).filter(Boolean);
  const products = await prisma.product.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        ...(words.length ? [{ tags: { hasSome: words } }] : []),
      ],
    },
    orderBy: { sortOrder: "asc" },
    take: limit,
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

  const data = products.map(toListItem);
  return apiSuccess({ products: data, total: data.length });
}
