# Caching plan: Next.js Data Cache vs Redis

Written 2026-09-09 after auditing the actual current caching (not from memory — see file references below). The rule going forward: **Next's Data Cache is the default for cacheable reads; Redis is only for what that cache genuinely can't do** (instant invalidation on write for a hot cross-cutting key, atomic counters, rate limiting, TTL'd ephemeral state). Do not move something to Redis just because it's a "hot read" if Next's cache already serves it for free.

## Current state (audited, not assumed)

**Next.js Data Cache** (`unstable_cache`, durable/shared on Vercel — not per-instance memory):

| Data | File | Window |
|---|---|---|
| Product listing | `app/api/products/route.ts` | 60s |
| Product detail by slug | `app/(public)/products/[slug]/page.tsx` | 60s |
| Related products (page) | `app/(public)/products/[slug]/page.tsx` | 300s |
| Related products (API) | `app/api/products/[slug]/related/route.ts` | 300s |
| Recommendations | `app/api/products/recommendations/route.ts` | 300s |
| Categories list | `app/api/categories/route.ts` | 300s |
| Category by slug | `app/(public)/categories/[slug]/page.tsx` | 300s |
| Category filters | `app/api/categories/[slug]/filters/route.ts` | 300s |
| Product filters | `app/api/products/filters/route.ts` | 300s |
| Menu | `app/api/menu/route.ts` | 300s |

Pages using this data are `force-dynamic` (need per-request context) but the expensive query underneath is memoized. Correctly **not** cached: `/api/storefront/governorate` and product-listing stock numbers (`Cache-Control: no-store`) — partner-assigned stock is visitor/governorate-specific and must never be shared across visitors.

**Redis (Upstash)** — two uses:
- OTP rate limiting/lockout — `lib/redis/otp-limits.ts` (fixed-window counters, cooldown, verify-attempt lock)
- Admin analytics cache — `lib/cache/analytics.ts` (5-min TTL, version-key bump for instant invalidation)

## Planned additions (Redis)

| Addition | Why Redis, not Next cache | Notes |
|---|---|---|
| Governorate → active partner resolution | Small fixed key set (~27 governorates), read on nearly every storefront request, but must reflect an admin's `ReroutingRule` edit immediately, not after a TTL | Reuse the version-key invalidation pattern from `lib/cache/analytics.ts`; bump version on rerouting-rule save |
| Extended rate limiting (login, checkout submit, coupon-code attempts, partner-registration form) | Cross-request counters, same proven pattern as OTP | Reuse `lib/redis/otp-limits.ts`'s fixed-window-counter approach |
| Admin notification-center unread counts (new feature) | Atomic `INCR`/`DECR`, avoids a DB count query on every render | Ties to the in-app notification center in `02-proposals.md` |
| Abandoned-cart trigger tracking (new feature) | TTL'd "last cart activity" key per session; a scheduled job reads idle carts without scanning the full table | Ties to abandoned-cart recovery email in `02-proposals.md` |
| Low-stock alert dedupe (new feature) | Short-TTL "already alerted" key per variant, avoids re-notifying admin every stock check | Ties to notification center |

## Planned change (Next cache, not Redis)

Switch the table above from time-based `revalidate` to `revalidateTag`, so saving a product/category/menu item in admin invalidates that specific cache entry immediately instead of waiting out the 60-300s window. This is a Next.js-only change — no new Redis keys, no new cost.

## Explicitly not moving to Redis

Everything in the "current state" table above. It's already free (Vercel Data Cache, not billed separately from hosting) and working. Duplicating it into Redis would only add Upstash command volume for no benefit.
