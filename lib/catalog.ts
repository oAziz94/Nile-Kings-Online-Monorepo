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
  | "newest"
  | "price_asc"
  | "price_desc"
  | "name_ar";

export interface ProductsQuery {
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  sizes?: string[];
  inStockOnly?: boolean;
  sort?: SortOption;
  limit?: number;
  offset?: number;
}
