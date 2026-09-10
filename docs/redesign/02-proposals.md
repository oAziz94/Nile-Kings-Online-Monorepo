# Redesign — PM proposals

Proposed by the PM (this session) on 2026-09-09, grounded in the actual current stack (`package.json`, `README.md`) and folder structure. Status: **approved as a set** by the user ("I like your recommends and I am open to them") — individual items get re-confirmed at the point they're scheduled into a phase, since some depend on decisions made earlier phases haven't reached yet (e.g. search only matters once Phase 1 design + Phase 4 storefront rebuild are underway).

Each item becomes a real backlog task (`03-backlog.md`) only once its phase comes up — this file is the source list, not the schedule.

## New features

| Feature | Status | Notes |
|---|---|---|
| Wishlist / saved items (storefront) | Approved | |
| Product reviews & ratings | **Rejected** (2026-09-10) | User explicitly dropped this feature. Not built |
| Postgres full-text search for product search | Approved | Replaces/augments current search; avoids a paid search service |
| Admin bulk actions (bulk order-status update, bulk product edit) | Approved | |
| In-app admin notification center (low stock, unrouted orders, pending partner requests) | Approved | |
| Abandoned-cart recovery email | Approved | Uses existing Resend/SMTP transactional email path |
| Order tracking timeline on customer profile | Approved | Visual status trail, not just current-status badge |
| JSON-LD product structured data + sitemap | Approved | SEO, no infra cost |
| PWA install for storefront | Approved | |
| Admin-browsable audit-log UI + general admin action logging | Approved | Order/OTP audit logs already exist (Postgres); this generalizes the same pattern to all admin actions (not Redis — see `07-analytics-and-audit-plan.md`) plus the UI to read it |
| Guest checkout (remove forced login at checkout) | **Rejected** (2026-09-10) | User explicitly rejected. Checkout stays login-required. The underlying gap — the login requirement is only client-JS-enforced, no server-side route guard — is still worth closing as a hardening fix when checkout is rebuilt, independent of this rejection |
| Real partner dashboard/home (`/partner`) | Approved (2026-09-10) | Today `/partner` is a one-line redirect to `/partner/products` with zero orientation for a new partner. Build a real landing screen mirroring `admin/dashboard.md`'s pattern: pending/open-order count, low-stock alert, recent restock-request activity, scoped by `partnerType` (AGENT vs DISTRIBUTOR see different things, same as their nav already differs) |
| Admin-editable shipping rates | Approved (2026-09-10) | Found during Phase 0: every shipping fee is computed from hardcoded constants (`lib/shipping/egypt-post-phase1/constants.ts`); an orphaned `ShippingRule` model+API exists but isn't wired to the live calculator. Rewire the calculator to read admin-configured zone/weight/rate rules, then build the admin UI. **Must seed the initial rule set with today's exact hardcoded values** (6 zones, base prices, weight tiers, 14% VAT, 10%/floor-5-EGP margin, flat 8 EGP prep fee) as the starting defaults — live pricing must not change the moment this ships, only become editable from that point on |
| Admin partner edit/deactivate UI | Approved (2026-09-10) | `admin/partners.md`: agents/distributors are currently view-only in the admin UI despite `PATCH /api/admin/partners/[id]` already supporting edits to name/governorate/phone/social links/`linkedAgentId`/`isActive`/notes. Add the edit form the backend already supports |
| Admin revoke/demote admin access | Approved (2026-09-10) | `admin/admins.md`: admin access can be granted (promote a customer) but never revoked from the UI — only a direct DB edit undoes it. Add a demote-to-customer action |
| Coupon validity window (`validFrom`/`validUntil`) in the coupon form | Approved (2026-09-10) | `admin/coupons.md`: both fields are fully handled server-side but have no form field — every coupon today is immediately live and never expires. Low effort, unblocks real flash-sale/time-boxed coupons |
| Confirmation step before a partner "executes" a stock transfer | Approved (2026-09-10) | `partner/distributor-requests.md`: "تنفيذ التحويل" (fulfill) immediately moves real inventory between partners with a single click, no undo. Add a confirm dialog |
| Agent-side visibility into a distributor's per-variant stock when reviewing a restock request | Approved (2026-09-10) | `partner/distributor-requests.md`: today an agent approves/fulfills a request without seeing the requesting distributor's current stock for those variants. Show it inline next to each requested line so the agent can sanity-check the request before acting. (User's explicit direction: agent-sees-distributor, not the reverse — fits the hierarchy, since agents oversee distributors) |
| Order/RoutedOrder status propagation at contradictory edges | Approved (2026-09-10) | See `04-decisions.md` 2026-09-10 for the full reasoning. The two models stay separate (routing pipeline state is legitimately orthogonal to commercial state mid-flight), but auto-propagate at the two edges where divergence is nonsensical — cancelling the order auto-cancels its routing record; the routing record reaching DELIVERED auto-marks the order DELIVERED. Everywhere else, just surface both statuses side by side wherever either appears |

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
| Drop `@vercel/analytics` Web Analytics | Approved | Free tier is 2,500 events/mo then pauses; Pro is $12/mo. Redundant with the existing Postgres `ViewLog`/`AddToCartLog` pipeline + Meta Pixel — see `07-analytics-and-audit-plan.md`. GA4 (free) considered separately if broader traffic-source analytics are wanted |
| Add Sentry error tracking | Approved | Free "Developer" tier: 5K errors/mo, free forever, capped at 1 user. Added during Phase 3; not in the stack today, and a full rewrite raises regression risk without it |
| Playwright smoke tests, one per verified screen | Approved | `ui-verifier`'s manual walkthrough doesn't persist as a regression check on its own; a minimal happy-path test per screen, added at verification time, does |

## Explicitly out of scope for now

- **Guest checkout** — user explicitly rejected 2026-09-10 ("no guest checkout whatsoever"). Checkout keeps its login requirement, full stop.
- **Product reviews & ratings** — user explicitly dropped 2026-09-10. No reviews/ratings feature, no moderation path, nothing storefront-visible for it.
