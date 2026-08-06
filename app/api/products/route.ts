import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductsQuery, ProductListItem, ColorVariantListItem } from "@/lib/catalog";
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

function parseQuery(req: NextRequest): ProductsQuery {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const section = searchParams.get("section") ?? undefined;
  const expandVariants = searchParams.get("expandVariants") === "true";
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
    expandVariants,
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
};

function colorKey(v: VariantRow): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

function toListItem(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: VariantRow[];
}): ProductListItem {
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

/** One list item per color variant (first variant per color used for slug/image/price). */
function toListItemsByVariant(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  category: { slug: string; name: string };
  variants: VariantRow[];
  productInStock: boolean;
}): ProductListItem[] {
  /** Representative row per color + total units across all sizes for that color (for sorting). */
  const byColor = new Map<string, { rep: VariantRow; totalStock: number }>();
  for (const v of p.variants) {
    const key = colorKey(v);
    const existing = byColor.get(key);
    if (!existing) {
      byColor.set(key, { rep: v, totalStock: v.stockAvailable });
    } else {
      existing.totalStock += v.stockAvailable;
    }
  }
  const items: ProductListItem[] = [];
  for (const { rep: v, totalStock } of byColor.values()) {
    const priceEgp = piastresToEgp(v.pricePiastres);
    const originalPriceEgp = originalPriceFromVariant(v.basePricePiastres, v.pricePiastres);
    const discountPercent = originalPriceEgp != null && originalPriceEgp > priceEgp
      ? discountPercentFromPrices(originalPriceEgp, priceEgp)
      : undefined;
    items.push({
      id: v.id,
      name: p.name,
      slug: p.slug,
      imageUrl: v.imageUrl ?? p.imageUrl,
      priceEgp,
      ...(originalPriceEgp && originalPriceEgp > priceEgp && { originalPriceEgp }),
      ...(discountPercent != null && { discountPercent }),
      categorySlug: p.category.slug,
      categoryName: p.category.name,
      inStock: p.productInStock,
      variantSlug: v.slug,
      stockAvailable: totalStock,
    });
  }
  return items;
}

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
  // Category view (الكل, الاكثر مبيعا, tag section) or كل المنتجات: show one card per color variant.
  const byVariant = Boolean(q.categorySlug) || Boolean(q.expandVariants);

  // When listing by category we show one card per color variant. We fetch matching products
  // (up to a cap), expand to variant-level list, then paginate by variant index so the
  // frontend can load all variants. Otherwise limit/offset would apply to products and
  // many variants would never appear.
  const SECTION_VIEW_PRODUCT_CAP = 500;
  const skip = hasPriceFilter ? 0 : byVariant ? 0 : q.offset;
  const take = hasPriceFilter ? 200 : byVariant ? SECTION_VIEW_PRODUCT_CAP : q.limit;

  const totalCount = hasPriceFilter
    ? null
    : await prisma.product.count({ where });

  const variantSelect = {
    id: true,
    slug: true,
    name: true,
    basePricePiastres: true,
    pricePiastres: true,
    stockAvailable: true,
    colorHex: true,
    colorName: true,
    imageUrl: true,
  } as const;

  const products = await prisma.product.findMany({
    where,
    orderBy,
    skip,
    take,
    include: {
      category: { select: { slug: true, name: true } },
      variants: { select: variantSelect },
    },
  });

  const stockAdjustedProducts = await Promise.all(
    products.map(async (product) => ({
      ...product,
      variants: await applyStorefrontPartnerStock(
        product.variants as VariantRow[],
        stockContext.partnerId
      ),
    }))
  );

  let filtered: ProductListItem[];

  if (byVariant) {
    filtered = stockAdjustedProducts.flatMap((p) =>
      toListItemsByVariant({
        ...p,
        productInStock: (p.variants as VariantRow[]).some((v) => v.stockAvailable > 0),
        variants: (p.variants as VariantRow[]).filter((v) => {
          if (q.sizes?.length && !q.sizes.includes(v.name)) return false;
          if (q.inStockOnly && v.stockAvailable <= 0) return false;
          return true;
        }),
      })
    );
  } else {
    filtered = stockAdjustedProducts.map(toListItem);
  }

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

  // When byVariant, paginate the variant-level list; total is variant count so frontend can load all.
  const start = hasPriceFilter ? (q.offset ?? 0) : (q.offset ?? 0);
  const end = start + (q.limit ?? 24);
  const paginated = filtered.slice(start, end);
  const total = hasPriceFilter
    ? filtered.length
    : byVariant
      ? filtered.length
      : (totalCount ?? paginated.length);
  const response = apiSuccess({ products: paginated, total });
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}
