# Public — Categories (list + single category)

Route(s): `app/(public)/categories/page.tsx` (list), `app/(public)/categories/[slug]/page.tsx` (single category / filtered listing)
Key files: `app/(public)/categories/categories-content.tsx`, `app/(public)/categories/[slug]/category-content.tsx`, `components/shared/catalog-filter-bar.tsx`, `components/shared/sort-dropdown.tsx`, `components/shared/product-card.tsx`, `components/shared/empty-state.tsx`, `components/shared/loading-dots.tsx`, `hooks/use-navigate-back-restore.ts`, `app/api/categories/route.ts`, `app/api/products/route.ts`, `app/api/products/filters/route.ts`, `lib/catalog.ts`, `lib/storefront-location.ts`

This file covers two distinct screens that share almost all client logic (`CategoryContent` is effectively `ProductsContent`/`products-content.tsx` scoped to one category — see `docs/redesign/00-feature-inventory/public/products-listing.md` for the sibling unscoped listing, which is line-for-line nearly identical):
1. **Categories list** (`/categories`) — grid of category tiles.
2. **Single category** (`/categories/[slug]`) — filtered/sorted product grid for one category, same UX pattern as the main products listing.

## Business requirements
- **Goal/KPI**: category list drives catalog discovery/navigation (acquisition, lower bounce from home); single-category view is a conversion surface — filtered browsing + sort + infinite scroll to keep shoppers in-grid as long as possible before a PDP click.
- **Trust/credibility signals**: EGP pricing and discount badges per product card (shared `ProductCard`); product counts on category tiles ("X منتج") set expectations before the click; out-of-stock badges shown honestly rather than hidden.
- **Friction points**: category tiles are plain text (name + count) with no image/visual differentiation — a shopper cannot recognize a category at a glance, only read it; the single-category page's filter bar always shows a text search box even though the shopper already navigated into one category (duplicates part of the standalone Products search/filter surface — see `search.md` for why there's no dedicated search screen).
- **Compliance/legal**: none specific to this screen.
- **URL/SEO stability**: `/categories` and `/categories/[slug]` must be preserved as-is (public storefront routes). `/categories/[slug]` is ISR-cached at the route level (`export const revalidate = 300`) with per-slug `generateMetadata` (title = category name, description references the category, canonical path `categories/{slug}`) — this metadata behavior must survive the rebuild for SEO.
- **Modern-look rationale**: infinite scroll + sticky filter bar is standard modern-ecommerce category browsing; no other business-specific rationale beyond conversion-surface parity with `products-listing.md`.

## Elements & behavior

### Categories list (`/categories`)
- [ ] Page header — "التصنيفات" with a `Package` icon, static.
- [ ] Category grid — 2 cols (mobile) → 3 (sm) → 4 (md+); each tile: category name (bold) + "{productCount} منتج" (count of `active: true` products only, computed server-side via `_count`). Clicking navigates to `/categories/{slug}`.
- [ ] Pagination — infinite scroll via `IntersectionObserver` on a sentinel div, page size 24 (`PAGE_SIZE`), appends on intersect; guarded against firing while already `loading`/`loadingMore` or when all items are loaded (`categories.length >= total`).
- [ ] Data source — `GET /api/categories?limit=&offset=`, `unstable_cache`'d 300s, ordered by `sortOrder asc`.

### Single category (`/categories/[slug]`)
- [ ] Category resolution — server component looks up the category by slug (`unstable_cache`'d 300s); calls `notFound()` (Next.js 404 page) if the slug doesn't match any category.
- [ ] Page header — category name as `<h1>`; if a `?section=` query param is present, it's shown as a subtitle line under the title (section = product-tag-based sub-filter, e.g. "اطقم" for sets — see Notes) but is **not** exposed as an interactive UI control anywhere on this page; it only takes effect if the URL already carries it (e.g. linked in from elsewhere).
- [ ] `CatalogFilterBar` — search input (debounced 250ms, syncs to `?q=`), size `<Select>` (options populated from `GET /api/products/filters?category={slug}`, category-scoped sizes only), and a "مسح" (clear) button that resets search+size (does not affect `?section=`). No category selector shown here (`showCategory={false}`) since the category is fixed by the route.
- [ ] `SortDropdown` — same 8 options as the main products listing: فيتشر (featured, default), أفضل مبيعات (best_sales), name A→Z/Z→A, price low→high/high→low, date oldest→newest/newest→oldest. Selecting a non-default sort adds `?sort=` to the URL.
- [ ] Product grid — 2 cols (mobile) → 3 (md/lg); `ProductCard`s exactly as in the main listing (quick-view, quick-shop modal, color-swatch hover, discount/out-of-stock badges).
- [ ] Pagination — infinite scroll, page size 9 (`PAGE_SIZE`), same `IntersectionObserver` pattern as categories list and the main products listing.
- [ ] Scroll/position restore on browser Back — `useNavigateBackRestore(\`storefront-category-${categorySlug}-scroll\`)`: when a shopper clicks a product card, the clicked product's id and the total loaded count are stashed in `sessionStorage`; navigating back re-fetches enough items to include that count and scrolls the original card back into view (`scrollIntoView({ block: "center" })`), then clears the stashed state.
- [ ] Data source — `GET /api/products?category={slug}&q=&sizes=&sort=&limit=&offset=` (same endpoint the unscoped products listing uses, with `category` always set); result set is `active: true` products in this category only, with partner-stock overrides applied per visitor.

## States
- [ ] Empty state — categories list: no dedicated empty state coded (an empty catalog would just render zero grid tiles with no message). Single category: "لا توجد منتجات" / "جرّب تغيير البحث أو المقاس المختار." with a "العودة للرئيسية" (back to home) button, shown when the filtered/sorted result set is empty.
- [ ] Loading state — categories list: full-page `LoadingDots` (large, centered) while the first page loads; subsequent pages show a smaller `LoadingDots` below the grid. Single category: identical pattern (`LoadingDots` for first load; the whole page is additionally wrapped in a `<Suspense>` boundary server-side with a `LoadingDots` fallback for the initial category-resolution request).
- [ ] Error state — no explicit error UI in either screen. A failed `/api/categories` or `/api/products` fetch is caught and silently treated as `success: false` → falls through to `setCategories([])`/`setProducts([])` (renders as an empty result, not a distinguishable "something went wrong" message).
- [ ] Permission-restricted state — not applicable; fully public.

## Edge cases
- [ ] Unknown category slug (`/categories/does-not-exist`) — server-side `notFound()` → Next.js not-found page (not a custom "category not found" screen specific to this feature).
- [ ] Governorate/partner not resolved (see `home.md` Edge cases) — every product in every category shows `inStock: false` / "نفذ" regardless of real inventory, identical zero-stock behavior as the rest of the storefront.
- [ ] Size filter becomes invalid after a category/search change — both screens re-fetch `/api/products/filters` on category or size change and clear the selected size (`if (size && !nextSizes.includes(size)) setSize("")`) if it's no longer among the available sizes for the new scope.
- [ ] `?section=` present but the corresponding product tag has zero matching products — falls through to the standard empty state; the subtitle line still displays the (now-empty) section label.
- [ ] Price-range and price-sort filters (`minPrice`/`maxPrice`, `price_asc`/`price_desc`) exist in the shared `/api/products` query contract (`lib/catalog.ts` `ProductsQuery`) but neither `CatalogFilterBar` nor `CategoryContent`/`ProductsContent` expose any UI for min/max price — only size and sort are user-facing; price sort/range are reachable only by hand-crafting the URL query string.

## Notes
- `CategoryContent` and `ProductsContent` (the unscoped products listing) are near-duplicate implementations sharing the same state machine, debounce, infinite-scroll, and scroll-restore logic, with `CategoryContent` fixing `category` to the route slug and hiding the category dropdown. A rebuild should treat these as one shared component/hook with a "locked category" prop rather than reimplementing the duplication, but must preserve both routes' independent scroll-restore storage keys (`storefront-products-scroll` vs. `storefront-category-{slug}-scroll`) and independent page sizes (9 for both, but verify against `products-listing.md` since these can drift).
- `?section=` is a read-only-in-UI query param that filters by `Product.tags` server-side (`lib/catalog.ts`: `if (q.section) where.tags = { has: q.section }`) — it exists for deep-linking from elsewhere (e.g. a product tag chip on the PDP links to `/products?section=...` per `products-pdp.md`, not to a category route) but has no category-page-native control. Do not assume it is dead code just because there's no visible UI for it in this file.
- `/api/categories/[slug]/filters/route.ts` exists in the codebase (min/max price + sizes + `hasInStock` for a category) but is **not called by either screen** — both use the category-scoped `/api/products/filters` instead. This route appears to be orphaned/superseded; confirm with engineering before assuming it needs a UI counterpart in the rebuild.
- Category tiles' product counts and the filter bar's size options are cached server-side for 300s (`unstable_cache`) and are visitor-independent; only the product grid's stock/price per visitor is fetched live (`no-store`).
