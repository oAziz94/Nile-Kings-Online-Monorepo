# Public — Search

Route(s): `app/(public)/search/` (directory exists in the repo but is **completely empty** — no `page.tsx`, no `layout.tsx`, nothing)
Key files: none — see Business requirements / Notes below.

## Business requirements
[NEEDS PM INPUT: There is currently no dedicated search screen or search API in this codebase. This file documents what was verified from the actual code, not an aspirational spec. Before `ui-implementer` builds anything for a "search" screen, PM must decide: (a) keep search folded into `/products?q=` as it works today (zero net-new surface, just theme the existing listing), or (b) build a genuinely new dedicated `/search` screen/experience — which would be new scope, not parity, and needs its own business-requirements pass like any other net-new feature.]

## Elements & behavior
- [ ] `app/(public)/search/` — empty directory, zero files (`page.tsx` does not exist). Confirmed via direct filesystem listing, not inference.
- [ ] `app/api/products/search/` — also an empty directory, zero files (`route.ts` does not exist). No standalone search API exists either.
- [ ] No search entry point exists anywhere in the persistent UI chrome — `components/shared/header.tsx` (the site header, present on every public page) has exactly three interactive icons: account/profile, cart, and a hamburger menu. There is no search icon, search bar, or search button. `components/shared/menu-drawer.tsx` (the hamburger's slide-out drawer) was also checked — no search link or field inside it either.
- [ ] The **only** place a shopper can search by text today is the search input embedded in `CatalogFilterBar` (`components/shared/catalog-filter-bar.tsx`), which appears on `/products` (unscoped) and `/categories/[slug]` (category-scoped) — see `products-listing.md` and `categories.md` for its full behavior (debounced `?q=` param, server-side match across product name/slug/description/tags/category name). This is a filter *within* an existing listing page, not a standalone search results screen, and it is not reachable except by first navigating to one of those two listing pages.

## States
- [ ] Empty state — not applicable; no screen exists to have states.
- [ ] Loading state — not applicable.
- [ ] Error state — not applicable.
- [ ] Permission-restricted state — not applicable.

## Edge cases
- [ ] N/A — nothing to derive edge cases from; there is no code path to trace.

## Notes
- This is a genuine gap, not an oversight in this inventory pass: both `app/(public)/search` and `app/api/products/search` exist as directories (likely scaffolded at some point, e.g. by a routing convention or an earlier planning pass) but contain zero files. `find`/`ls` on both confirms 0 entries beyond `.`/`..`.
- Because there is no header/menu search entry point at all, a shopper's only way to search today is to already be on `/products` or a category page and use the filter bar's search box — there is no way to search from the home page, a PDP, the cart, or checkout without first navigating to a listing page.
- If PM decides option (a) from Business requirements above (keep search folded into `/products`), this file's role in the redesign is effectively "no-op, defer to `products-listing.md`" — but the index/checklist entry for "search" should not be treated as parity-complete without an explicit PM sign-off, since the current experience (no search affordance in the header) is plausibly itself a conversion/discoverability gap worth surfacing as a `02-proposals.md` item rather than silently preserving as-is.
