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
  /** Unique color variants for card swatches; image switches on hover. Omitted when one card per variant (section view). */
  colorVariants?: ColorVariantListItem[];
  /** When set, card links to this variant (variant slug). Used when listing one product per color variant. */
  variantSlug?: string | null;
}

/** When original > price, returns rounded discount percentage; otherwise undefined. */
export function discountPercentFromPrices(original: number, price: number): number | undefined {
  if (original <= 0 || price >= original) return undefined;
  return Math.round(((original - price) / original) * 100);
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
  categorySlug?: string;
  /** Section tag (e.g. "اطقم"). When set, filter by product tags and return one item per color variant. */
  section?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  inStockOnly?: boolean;
  sort?: SortOption;
  limit?: number;
  offset?: number;
}
