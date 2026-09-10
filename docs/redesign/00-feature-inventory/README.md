# Feature inventory

One file per screen (or tight group of related screens), capturing exactly what the current UI does — this is the parity checklist `ui-implementer` must preserve and `ui-verifier` grades against. Written from the current code, not from the new design.

## Template for each screen file

Per the PM role brief (`../05-role-brief.md`), every screen file pairs a **business requirements** section with the technical one — not technical alone.

```markdown
# <Surface> — <Screen name>

Route(s): `app/(surface)/...`
Key files: components/..., lib/...

## Business requirements
- Goal/KPI this screen serves (conversion, AOV, retention, trust, ops efficiency, SEO, ...)
- Trust/credibility signals that must survive the redesign (pricing clarity, delivery expectations, COD/prepaid framing, policy visibility, ...)
- Known or plausible friction points in the current flow
- Compliance/legal considerations, if any
- Any business reason behind a "modern look" choice for this screen (vs. pure aesthetics)

## Elements & behavior
- [ ] <element> — <exact current behavior>

## States
- [ ] Empty state
- [ ] Loading state
- [ ] Error state
- [ ] Permission-restricted state (if role-gated)

## Edge cases
- [ ] <edge case> — <expected behavior>

## Notes
<anything non-obvious a rebuild could easily miss>
```

## Index

Screens to inventory, grouped by surface. Check off once a file exists for it.

### `(auth)`
- [x] login — `auth/login.md`
- [x] register — `auth/register.md`
- [x] forgot-password — `auth/forgot-password.md`

### `(public)`
- [x] home — `public/home.md`
- [x] categories / categories/[slug] — `public/categories.md`
- [x] products / products/[slug] (PDP) — split into `public/products-listing.md` and `public/products-pdp.md`
- [x] search — `public/search.md` (⚠ screen doesn't exist in current code — `/search` route and its API are empty stubs; flagged `[NEEDS PM INPUT]`)
- [x] cart — `public/cart.md`
- [x] checkout — `public/checkout.md` (extra scrutiny applied per decisions log — see notes below)
- [x] partners (become-a-partner request form) — `public/become-a-partner.md`
- [x] profile/account — `public/profile-account.md`
- [x] profile/addresses — `public/profile-addresses.md`
- [x] profile/orders — `public/profile-orders.md`
- [x] profile/senior — `public/profile-senior.md` (⚠ not an accessible/simplified variant — see notes below)
- [x] privacy / terms (static — low priority) — split into `public/privacy.md` and `public/terms.md`

### `(partner)`
- [x] partner dashboard/home — `partner/dashboard.md`
- [x] partner/orders — `partner/orders.md`
- [x] partner/routed-orders — `partner/routed-orders.md`
- [x] partner/products — `partner/products.md`
- [x] partner/restock-requests — `partner/restock-requests.md`
- [x] partner/distributors — `partner/distributors.md`
- [x] partner/distributor-requests — `partner/distributor-requests.md`
- [x] partner/reports — `partner/reports.md`

### `(admin)`
- [x] admin dashboard/home — `admin/dashboard.md`
- [x] admin/products — `admin/products.md`
- [x] admin/categories — `admin/categories.md`
- [x] admin/orders — `admin/orders.md`
- [x] admin/routed-orders — `admin/routed-orders.md`
- [x] admin/partners — `admin/partners.md`
- [x] admin/partner-inventory — `admin/partner-inventory.md`
- [x] admin/rerouting-rules — `admin/rerouting-rules.md`
- [x] admin/coupons — `admin/coupons.md`
- [x] admin/shipping — `admin/shipping.md`
- [x] admin/clients — `admin/clients.md`
- [x] admin/admins — `admin/admins.md`
- [x] admin/analytics — `admin/analytics.md`
- [x] admin/settings — `admin/settings.md`

## Phase 0 status: complete (2026-09-10)

All 37 index items are covered across 39 files (2 items were split into 2 files each — see the `⚠`/split notes above). Highlights that need a PM decision before Phase 3 (foundation build) locks in specs — full detail in each file:

- **Two live-app security gaps found, independent of the redesign** (reported to the user directly, not just filed here): an open-redirect inconsistency on `register`'s redirect-target validation, and no rate limiting on password login/register.
- **`/search` doesn't exist today** — both the route and its API are empty stubs; the only current text search is the `?q=` param on `/products` and `/categories/[slug]`. Needs a decision: build real search in v2, or keep routing search intent into the existing filtered-listing pattern.
- **`/profile/senior` is not an accessibility variant** — it's an unlinked (URL-only) senior-citizen (60+) national-ID verification form that unlocks a promo, visually identical to the rest of the profile section. Genuine accessibility work for older users should be treated as new v2 scope, not parity work.
- **Checkout has several fragile, easy-to-regress behaviors**: InstaPay account selection keyed off a partner *name* string match (not an id); "lower shipping with InstaPay" is a COD-fee display artifact, not a real shipping-rate difference; delivery governorate (form field) and fulfillment governorate (a separate storefront-location cookie) are two different things that a UI-focused rebuild could easily collapse into one.
- **OTP auth infrastructure exists but is unused** — fully built (Twilio, Redis rate-limits, lockout) but only wired into forgot-password; login/register are pure password flows today. Needs a v2 decision: wire it in properly, or remove the dead path.
- **Admin partner-inventory KPI cards are page-scoped, not true totals** — they sum only the current pagination page, which can silently mislead ops staff who read them as store-wide totals for the selected partner.
