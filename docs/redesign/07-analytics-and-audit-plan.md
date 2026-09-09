# Analytics & admin audit log plan

Written 2026-09-09, grounded in the actual current code (see file references) plus current Vercel Analytics pricing (verified via web search, sources below).

## Analytics — is it a replacement for Vercel's plugin?

**Current state:**
- `<Analytics />` from `@vercel/analytics/react` is mounted in `app/(public)/layout.tsx` — this is Vercel Web Analytics (generic pageview/visitor tracking), billed separately from hosting.
- Meta Pixel is also mounted in the same layout (ad-attribution tracking, free).
- The app already has its own event pipeline in Postgres, independent of Vercel: `ViewLog` and `AddToCartLog` models (`prisma/schema.prisma`), written via `app/api/analytics/view` and `app/api/analytics/add-to-cart`, read by an admin analytics dashboard cached in Redis (`lib/cache/analytics.ts`, 5-min TTL).

**Vercel Web Analytics pricing** (verified 2026-09-09): free tier is 2,500 events/month, after which collection simply pauses until the next billing cycle unless you upgrade. Pro is $12/month for 25,000 events, with overage at $0.65/1,000. 2,500 events/month is roughly 80/day — a live storefront will blow through that in the first day or two of real traffic, so this either silently stops collecting (free tier) or starts costing money for a fairly generic pageview count.

**Recommendation: drop `<Analytics />`.** It's redundant with what's already built, and its free tier is too small to be useful for a real store. The existing Postgres event pipeline (`ViewLog`/`AddToCartLog` → admin dashboard) is more valuable anyway — it's tied to actual product/conversion data, not just pageviews, and costs nothing extra since it's already-paid-for Postgres storage. Meta Pixel stays (ad attribution, free, already working).

**Optional addition, not a requirement**: if you want broader traffic-source/session/funnel analytics beyond product-level events (which `ViewLog`/`AddToCartLog` don't cover — no referrer, device, session duration, etc.), Google Analytics 4 is free at any realistic scale for this store and is the standard tool for that job. It wouldn't compete with the in-house event log — GA4 for marketing/traffic analysis, Postgres events for product/conversion data tied to real orders. Decide only if you actually want that traffic-source visibility; not adding it by default.

**Vercel Speed Insights** (a different product from Web Analytics, for Core Web Vitals) is not currently installed. Worth considering during the redesign specifically to catch performance regressions — it has its own separate free-tier limits, evaluate at Phase 6 alongside the rest of the performance work, not now.

## Admin audit log — Postgres, not Redis

**Current state**: the audit-log pattern already exists, just scoped narrowly — `OrderAuditLog` and `OtpAuditLog` (`prisma/schema.prisma`), written via simple helpers like `lib/audit/order-audit.ts` (a plain `prisma.orderAuditLog.create()` call, no queue, no external service). There is no audit log yet for general admin actions (editing a product, changing a coupon, deactivating a partner, editing site settings, managing other admins, etc.) — only order lifecycle and OTP events are tracked today.

**Recommendation: extend the existing Postgres pattern, don't move it to Redis.** Redis is the wrong tool for this specifically because an audit trail's entire value is being durable and queryable over the long term (indefinitely, or per your retention policy) — Redis is an in-memory/TTL'd store, values can be evicted, and filtering "everything admin X did in March" is awkward there compared to an indexed SQL query. It also wouldn't actually be lighter: a single `INSERT` on an already-open Neon connection (what the existing pattern does) costs a few milliseconds and zero extra infrastructure, whereas routing it through Redis would add new Upstash command volume for a worse result. Postgres storage for rows this small is effectively free at this project's scale.

**Design**, generalizing the existing per-entity pattern into one table:

```prisma
model AdminActionLog {
  id         String   @id @default(cuid())
  actorId    String        // User.id (role is snapshotted, not looked up later)
  actorRole  String        // "ADMIN" at time of action
  action     String        // e.g. "product.update", "coupon.delete", "partner.deactivate"
  entityType String        // "Product" | "Coupon" | "Partner" | "SiteSetting" | ...
  entityId   String?
  details    Json?         // before/after diff or relevant fields
  createdAt  DateTime @default(now())

  @@index([actorId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
```

One `logAdminAction()` helper (same shape as `lib/audit/order-audit.ts`), called from each admin mutation route. This is a real chunk of work — it touches most of `app/api/admin/*` — so it's sized as its own technical task in Phase 5 alongside the "admin-browsable audit-log UI" feature already in `02-proposals.md`, not a quick add-on.

**Where Redis *could* help, later, optionally**: only as a read-side cache for the audit-log *browsing UI* itself, if it turns out to get heavy repeated-query traffic (same pattern as `lib/cache/analytics.ts` — cache a paginated query result for a minute or two). That's an optimization on top of the Postgres source of truth, not a replacement for it, and not needed on day one — add it only if Phase 2's usage baseline shows that screen actually gets hit hard.

## Sources
- [Pricing for Web Analytics](https://vercel.com/docs/analytics/limits-and-pricing)
- [Vercel Pricing in 2026: Plans, Credits, and What You'll Actually Pay](https://flexprice.io/blog/vercel-pricing-breakdown)
