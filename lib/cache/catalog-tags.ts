/**
 * Cache-tag names for the catalog `unstable_cache` entries (backlog 6.3, `06-caching-plan.md`).
 * One place for the tag strings so admin write routes and the cached reads never drift.
 *
 * `CATALOG_TAG` covers every catalog read that can be affected by a product write: listings,
 * the PDP, related products, recommendations, filters and the home page all carry it (see
 * `06-caching-plan.md`'s table) — a product edit invalidates all of them at once instead of
 * requiring each write route to know which reads exist.
 *
 * `productTag(slug)` is a narrower, per-product tag used only where the cache is keyed by a
 * single slug (the PDP's product-detail cache) so a change to one product doesn't need to be
 * broad-invalidated under a name that also covers every other product's own per-slug entry —
 * it's applied in addition to `CATALOG_TAG`, not instead of it.
 */

import { revalidateTag } from "next/cache";

export const CATALOG_TAG = "catalog";
export const CATEGORIES_TAG = "categories";
export const MENU_TAG = "menu";
export const REROUTING_RULES_TAG = "rerouting-rules";

export function productTag(slug: string): string {
  return `catalog:product:${slug}`;
}

/**
 * Call after any write that changes product/variant data (create, update, delete, bulk apply,
 * media assignment/replace/sync affecting product images, color/representative changes).
 * Always revalidates the broad catalog tag; pass `productSlugs` to also revalidate the specific
 * per-product PDP cache entries for the products touched.
 */
export function revalidateCatalog(opts?: { productSlugs?: string[] }): void {
  revalidateTag(CATALOG_TAG);
  for (const slug of opts?.productSlugs ?? []) {
    revalidateTag(productTag(slug));
  }
}

/**
 * Call after any write that changes category data (create, update, delete, reorder). Categories
 * also drive the storefront menu, so this revalidates `MENU_TAG` too.
 */
export function revalidateCategories(): void {
  revalidateTag(CATEGORIES_TAG);
  revalidateTag(MENU_TAG);
}

/** Call after any write that changes the menu independently of categories (currently none — kept for parity/future use). */
export function revalidateMenu(): void {
  revalidateTag(MENU_TAG);
}

/** Call after any write to a `ReroutingRule` (create/update/delete/priority change). */
export function revalidateReroutingRules(): void {
  revalidateTag(REROUTING_RULES_TAG);
}
