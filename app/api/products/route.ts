import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductsQuery, ProductListItem } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices } from "@/lib/catalog";

export const dynamic = "force-dynamic";

function parseQuery(req: NextRequest): ProductsQuery {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category") ?? undefined;
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const sizes = searchParams.get("sizes");
  const inStockOnly = searchParams.get("inStock") === "true";
  const sort = (searchParams.get("sort") as ProductsQuery["sort"]) ?? "newest";
  const limit = Math.min(Number(searchParams.get("limit")) || 24, 48);
  const offset = Number(searchParams.get("offset")) || 0;

  return {
    categorySlug,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    sizes: sizes ? sizes.split(",").filter(Boolean) : undefined,
    inStockOnly,
    sort,
    limit,
    offset,
  };
}

function toListItem(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: { pricePiastres: number; stockAvailable: number }[];
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
  };
}

export async function GET(req: NextRequest) {
  const q = parseQuery(req);

  const where: Prisma.ProductWhereInput = {
    active: true,
  };

  if (q.categorySlug) {
    where.category = { slug: q.categorySlug };
  }

  if (q.inStockOnly || q.sizes?.length) {
    where.variants = {
      some: {
        ...(q.inStockOnly && { stockAvailable: { gt: 0 } }),
        ...(q.sizes?.length ? { name: { in: q.sizes } } : {}),
      },
    };
  }

  const orderBy =
    q.sort === "name_ar"
      ? { name: "asc" as const }
      : { createdAt: "desc" as const };

  const hasPriceFilter = q.minPrice != null || q.maxPrice != null;
  const skip = hasPriceFilter ? 0 : q.offset;
  const take = hasPriceFilter ? 200 : q.limit;

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take,
    include: {
      category: { select: { slug: true, name: true } },
      variants: { select: { pricePiastres: true, stockAvailable: true } },
    },
  });

  let filtered = products.map(toListItem);

  if (q.minPrice != null || q.maxPrice != null) {
    filtered = filtered.filter((p) => {
      if (q.minPrice != null && p.priceEgp < q.minPrice) return false;
      if (q.maxPrice != null && p.priceEgp > q.maxPrice) return false;
      return true;
    });
  }

  if (q.sort === "price_asc") filtered.sort((a, b) => a.priceEgp - b.priceEgp);
  else if (q.sort === "price_desc") filtered.sort((a, b) => b.priceEgp - a.priceEgp);

  const start = hasPriceFilter ? (q.offset ?? 0) : 0;
  const end = start + (q.limit ?? 24);
  const paginated = filtered.slice(start, end);
  return apiSuccess({ products: paginated, total: filtered.length });
}
