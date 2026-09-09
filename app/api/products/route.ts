import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductsQuery, ProductListItem } from "@/lib/catalog";
import { buildProductListItem } from "@/lib/catalog";
import {
  applyPartnerStockOverrides,
  getPartnerStockOverrides,
  getStorefrontGovernorateFromRequest,
  getStorefrontStockContext,
} from "@/lib/storefront-location";
import { getProductIdsRankedByRecentSales } from "@/lib/products/ranked-listing";

function parseQuery(req: NextRequest): ProductsQuery {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const section = searchParams.get("section") ?? undefined;
  const minPrice = searchParams.get("minPrice");
  const maxPrice = searchParams.get("maxPrice");
  const sizes = searchParams.get("sizes");
  const inStockOnly = searchParams.get("inStock") === "true";
  const sort = (searchParams.get("sort") as ProductsQuery["sort"]) ?? "featured";
  const limit = Math.min(Number(searchParams.get("limit")) || 24, 48);
  const offset = Number(searchParams.get("offset")) || 0;

  return {
    q: q && q.trim() ? q.trim() : undefined,
    categorySlug,
    section: section && section.trim() ? section.trim() : undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    sizes: sizes ? sizes.split(",").filter(Boolean) : undefined,
    inStockOnly,
    sort,
    limit,
    offset,
  };
}

type VariantRow = {
  id: string;
  slug: string | null;
  name: string;
  basePricePiastres: number | null;
  pricePiastres: number;
  stockAvailable: number;
  colorHex: string | null;
  colorName: string | null;
  imageUrl: string | null;
  /** From `unstable_cache`: a fresh query returns a Date, a cache-hit returns its JSON-serialized ISO string. */
  createdAt: Date | string;
};

const productsListingVariantSelect = {
  id: true,
  slug: true,
  name: true,
  basePricePiastres: true,
  pricePiastres: true,
  stockAvailable: true,
  colorHex: true,
  colorName: true,
  imageUrl: true,
  createdAt: true,
} as const;

/**
 * The product listing query itself has no per-visitor dependency (stock is overridden after
 * the cache read), so the filtered/sorted/paginated result is cached per unique combination
 * of where/orderBy/skip/take — the same search hitting the DB at most once per minute instead
 * of on every request.
 */
const getProductsPage = unstable_cache(
  async (
    whereJson: string,
    orderByJson: string,
    skip: number,
    take: number,
    wantCount: boolean
  ) => {
    const where = JSON.parse(whereJson) as Prisma.ProductWhereInput;
    const orderBy = JSON.parse(orderByJson) as
      | Prisma.ProductOrderByWithRelationInput
      | Prisma.ProductOrderByWithRelationInput[];

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          category: { select: { slug: true, name: true } },
          variants: { select: productsListingVariantSelect },
        },
      }),
      wantCount ? prisma.product.count({ where }) : Promise.resolve(null),
    ]);
    return { products, totalCount };
  },
  ["products-listing"],
  { revalidate: 60 }
);

export async function GET(req: NextRequest) {
  const q = parseQuery(req);
  const stockContext = await getStorefrontStockContext(getStorefrontGovernorateFromRequest(req));

  const where: Prisma.ProductWhereInput = {
    active: true,
  };

  if (q.categorySlug) {
    where.category = { slug: q.categorySlug };
  }

  if (q.q) {
    where.OR = [
      { name: { contains: q.q, mode: "insensitive" } },
      { slug: { contains: q.q, mode: "insensitive" } },
      { description: { contains: q.q, mode: "insensitive" } },
      { tags: { has: q.q } },
      { category: { name: { contains: q.q, mode: "insensitive" } } },
    ];
  }

  if (q.section) {
    where.tags = { has: q.section };
  }

  if (q.inStockOnly || q.sizes?.length) {
    where.variants = {
      some: {
        ...(q.inStockOnly && !stockContext.partnerId && { stockAvailable: { gt: 0 } }),
        ...(q.sizes?.length ? { name: { in: q.sizes } } : {}),
      },
    };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] =
    q.sort === "name_ar"
      ? { name: "asc" }
      : q.sort === "name_za"
        ? { name: "desc" }
        : q.sort === "date_asc"
          ? { createdAt: "asc" }
          : q.sort === "date_desc" || q.sort === "best_sales"
            ? { createdAt: "desc" }
            : [{ sortOrder: "desc" }, { createdAt: "desc" }];

  const hasPriceFilter = q.minPrice != null || q.maxPrice != null;
  // price_asc/price_desc are applied client-side (below), so they need every matching product
  // fetched up front and sorted before slicing to a page — same as the price-range filter case —
  // rather than a single DB-paginated page re-sorted in isolation.
  const needsFullFetch = hasPriceFilter || q.sort === "price_asc" || q.sort === "price_desc";
  const FULL_FETCH_CAP = 500;

  const skip = needsFullFetch ? 0 : q.offset;
  const take = needsFullFetch ? FULL_FETCH_CAP : q.limit;

  const [{ products, totalCount }, bestSalesRankedIds] = await Promise.all([
    getProductsPage(JSON.stringify(where), JSON.stringify(orderBy), skip ?? 0, take ?? 24, !needsFullFetch),
    q.sort === "best_sales" ? getProductIdsRankedByRecentSales(where) : Promise.resolve(null),
  ]);

  const allVariantIds = products.flatMap((p) => (p.variants as VariantRow[]).map((v) => v.id));
  const overrides = await getPartnerStockOverrides(allVariantIds, stockContext.partnerId);
  let stockAdjustedProducts = products.map((product) => ({
    ...product,
    variants: applyPartnerStockOverrides(product.variants as VariantRow[], overrides),
  }));

  // "Best sales" is a per-product metric (summed across all of a product's variants), so it's
  // applied here rather than as a per-card sort like price_asc/price_desc further down.
  if (bestSalesRankedIds) {
    const rankIndex = new Map(bestSalesRankedIds.map((id, i) => [id, i]));
    stockAdjustedProducts = [...stockAdjustedProducts].sort(
      (a, b) => (rankIndex.get(a.id) ?? Infinity) - (rankIndex.get(b.id) ?? Infinity)
    );
  }

  let filtered: ProductListItem[] = stockAdjustedProducts.map((p) =>
    buildProductListItem({
      ...p,
      variants: (p.variants as VariantRow[]).filter((v) => {
        if (q.sizes?.length && !q.sizes.includes(v.name)) return false;
        if (q.inStockOnly && v.stockAvailable <= 0) return false;
        return true;
      }),
    })
  );

  if (q.minPrice != null || q.maxPrice != null) {
    filtered = filtered.filter((p) => {
      if (q.minPrice != null && p.priceEgp < q.minPrice) return false;
      if (q.maxPrice != null && p.priceEgp > q.maxPrice) return false;
      return true;
    });
  }
  if (q.inStockOnly) filtered = filtered.filter((p) => p.inStock);

  if (q.sort === "price_asc") filtered.sort((a, b) => a.priceEgp - b.priceEgp);
  else if (q.sort === "price_desc") filtered.sort((a, b) => b.priceEgp - a.priceEgp);

  const start = q.offset ?? 0;
  const end = start + (q.limit ?? 24);
  const paginated = needsFullFetch ? filtered.slice(start, end) : filtered;
  const total = needsFullFetch ? filtered.length : (totalCount ?? paginated.length);
  const response = apiSuccess({ products: paginated, total });
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}
