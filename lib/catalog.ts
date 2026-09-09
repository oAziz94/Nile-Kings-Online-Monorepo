/**
 * Catalog types and helpers for storefront API.
 * Prices in API responses are in EGP (piastres / 100).
 */

export function piastresToEgp(piastres: number): number {
  return Math.round(piastres / 100);
}

export interface CategoryPublic {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  productCount?: number;
}

export interface VariantPublic {
  id: string;
  sku: string;
  name: string;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  stockAvailable: number;
  inStock: boolean;
  colorHex?: string | null;
  colorName?: string | null;
  /** Optional; used for product page and quick-shop modal variant links/images. */
  slug?: string | null;
  imageUrl?: string | null;
}

export interface ColorVariantListItem {
  id: string;
  colorHex: string | null;
  colorName: string | null;
  imageUrl: string | null;
}

export interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  categorySlug: string;
  categoryName: string;
  inStock: boolean;
  /** Unique color variants for card swatches; image switches on hover. */
  colorVariants?: ColorVariantListItem[];
  /** Slug of the default (most in-stock) color variant; card links straight to that color. */
  variantSlug?: string | null;
}

/** When original > price, returns rounded discount percentage; otherwise undefined. */
export function discountPercentFromPrices(original: number, price: number): number | undefined {
  if (original <= 0 || price >= original) return undefined;
  return Math.round(((original - price) / original) * 100);
}

export function originalPriceFromExplicitDiscount(
  basePricePiastres: number | null,
  discountPricePiastres: number | null
): number | undefined {
  if (discountPricePiastres == null) return undefined;
  if (basePricePiastres == null || basePricePiastres <= discountPricePiastres) return undefined;
  return piastresToEgp(basePricePiastres);
}

export function originalPriceFromVariant(
  basePricePiastres: number | null,
  pricePiastres: number
): number | undefined {
  if (basePricePiastres == null || basePricePiastres <= pricePiastres) return undefined;
  return piastresToEgp(basePricePiastres);
}

export interface ProductListItemVariantInput {
  id: string;
  pricePiastres: number;
  stockAvailable: number;
  colorHex?: string | null;
  colorName?: string | null;
  imageUrl?: string | null;
  slug?: string | null;
  /** Accepts a string too: values read back from `unstable_cache` are JSON round-tripped, so a Date becomes an ISO string. */
  createdAt?: Date | string;
}

export interface ProductListItemInput {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: ProductListItemVariantInput[];
}

function colorGroupKey(v: { colorHex?: string | null; colorName?: string | null }): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

function createdAtTime(v: { createdAt?: Date | string }): number {
  return v.createdAt ? new Date(v.createdAt).getTime() : 0;
}

/**
 * Builds one catalog card per product (never one per color). Groups a product's variants by
 * color and leads the card with whichever color currently has the most total stock across its
 * sizes — the color a shopper is actually likely to be able to buy — instead of an arbitrary
 * first-encountered color. Ties break toward the earliest-added color so the pick stays stable
 * across requests. Swatches for every color are still included for in-grid preview.
 */
export function buildProductListItem(p: ProductListItemInput): ProductListItem {
  const inStock = p.variants.some((v) => v.stockAvailable > 0);

  const byColor = new Map<string, { rep: ProductListItemVariantInput; totalStock: number }>();
  for (const v of p.variants) {
    const key = colorGroupKey(v);
    const group = byColor.get(key);
    if (!group) {
      byColor.set(key, { rep: v, totalStock: v.stockAvailable });
      continue;
    }
    group.totalStock += v.stockAvailable;
    const candidateIsOlder = createdAtTime(v) < createdAtTime(group.rep);
    if (
      v.stockAvailable > group.rep.stockAvailable ||
      (v.stockAvailable === group.rep.stockAvailable && candidateIsOlder)
    ) {
      group.rep = v;
    }
  }

  let defaultColor: { rep: ProductListItemVariantInput; totalStock: number } | undefined;
  for (const group of byColor.values()) {
    const candidateIsOlder = !defaultColor || createdAtTime(group.rep) < createdAtTime(defaultColor.rep);
    if (
      !defaultColor ||
      group.totalStock > defaultColor.totalStock ||
      (group.totalStock === defaultColor.totalStock && candidateIsOlder)
    ) {
      defaultColor = group;
    }
  }

  const seen = new Set<string>();
  const colorVariants: ColorVariantListItem[] = [];
  for (const v of p.variants) {
    const key = v.colorHex ?? "default";
    if (seen.has(key)) continue;
    seen.add(key);
    colorVariants.push({
      id: v.id,
      colorHex: v.colorHex ?? null,
      colorName: v.colorName ?? null,
      imageUrl: v.imageUrl ?? p.imageUrl,
    });
  }

  const priceSourceVariants = defaultColor
    ? p.variants.filter((v) => colorGroupKey(v) === colorGroupKey(defaultColor!.rep))
    : p.variants;
  const prices = priceSourceVariants.map((v) => v.pricePiastres);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const currentPiastres = p.discountPricePiastres ?? minPrice;
  const priceEgp = piastresToEgp(currentPiastres);
  const originalPriceEgp = originalPriceFromExplicitDiscount(p.basePricePiastres, p.discountPricePiastres);
  const discountPercent =
    originalPriceEgp != null && originalPriceEgp > priceEgp
      ? discountPercentFromPrices(originalPriceEgp, priceEgp)
      : undefined;

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: defaultColor?.rep.imageUrl ?? p.imageUrl,
    priceEgp,
    ...(originalPriceEgp && originalPriceEgp > priceEgp && { originalPriceEgp }),
    ...(discountPercent != null && { discountPercent }),
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    inStock,
    ...(colorVariants.length > 0 && { colorVariants }),
    ...(defaultColor?.rep.slug && { variantSlug: defaultColor.rep.slug }),
  };
}

export interface ProductDetail extends ProductListItem {
  description: string | null;
  tags: string[];
  variants: VariantPublic[];
}

export type SortOption =
  | "featured"
  | "best_sales"
  | "name_ar"
  | "name_za"
  | "price_asc"
  | "price_desc"
  | "date_asc"
  | "date_desc";

export interface ProductsQuery {
  q?: string;
  categorySlug?: string;
  /** Section tag (e.g. "اطقم"). When set, filter by product tags. */
  section?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  inStockOnly?: boolean;
  sort?: SortOption;
  limit?: number;
  offset?: number;
}
