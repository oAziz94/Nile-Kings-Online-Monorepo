# Redesign — PM proposals

Proposed by the PM (this session) on 2026-09-09, grounded in the actual current stack (`package.json`, `README.md`) and folder structure. Status: **approved as a set** by the user ("I like your recommends and I am open to them") — individual items get re-confirmed at the point they're scheduled into a phase, since some depend on decisions made earlier phases haven't reached yet (e.g. search only matters once Phase 1 design + Phase 4 storefront rebuild are underway).

Each item becomes a real backlog task (`03-backlog.md`) only once its phase comes up — this file is the source list, not the schedule.

## New features

| Feature | Status | Notes |
|---|---|---|
| Wishlist / saved items (storefront) | Approved | |
| Product reviews & ratings | Approved | Needs a moderation path in admin |
| Postgres full-text search for product search | Approved | Replaces/augments current search; avoids a paid search service |
| Admin bulk actions (bulk order-status update, bulk product edit) | Approved | |
| In-app admin notification center (low stock, unrouted orders, pending partner requests) | Approved | |
| Abandoned-cart recovery email | Approved | Uses existing Resend/SMTP transactional email path |
| Order tracking timeline on customer profile | Approved | Visual status trail, not just current-status badge |
| JSON-LD product structured data + sitemap | Approved | SEO, no infra cost |
| PWA install for storefront | Approved | |
| Admin-browsable audit-log UI | Approved | Audit logging already exists per README; this adds the UI to read it |

## Library / standardization swaps

| Swap | Status | Notes |
|---|---|---|
| Expand Radix primitives + formalize shadcn/ui conventions | Approved | `components/ui` already follows this pattern; extend it |
| `react-hook-form` + Zod resolver for admin/partner forms | Approved | Reuses existing server-side Zod schemas |
| TanStack Table for admin data tables | Approved | products, orders, partners, routed-orders, clients |
| TanStack Query for admin/partner client data fetching | Approved | Cuts redundant requests, reduces DB load |

## Performance & hosting-cost initiatives

| Initiative | Status | Notes |
|---|---|---|
| ISR for storefront category/product pages | Approved | Fewer Vercel invocations + Neon queries per pageview |
| Switch product/category caches from time-based `revalidate` to `revalidateTag` | Approved | Admin edits invalidate immediately instead of waiting out the 60-300s window; existing `unstable_cache` usage stays, just gains tags |
| Targeted Redis additions (not a general cache migration) | Approved | See `06-caching-plan.md` — governorate→partner resolution, extended rate-limiting, notification-center counters, abandoned-cart tracking, low-stock alert dedupe. Product/category/menu/filter reads stay on Next's Data Cache, already free and working |
| Consistent `next/image` + Cloudinary `f_auto,q_auto` | Approved | Cloudinary bills on bandwidth/transforms |
| Confirm Prisma uses Neon's pooled connection string | Approved | Avoids connection-exhaustion cost under load |
| Server-components-first audit | Approved | Trim client JS where App Router allows server-only |
| Baseline-measure usage before any provider swap | Approved | Precondition for the "open to swapping providers" infra decision |

## Explicitly out of scope for now

Nothing rejected yet — nothing has been dropped from the list above.
