# Admin — Shipping

Route(s): `app/(admin)/admin/shipping/` — **directory exists but is completely empty (no `page.tsx`, no subroutes).** Visiting `/admin/shipping` in the running app hits Next.js's default 404, not an admin screen. There is also no sidebar nav entry for it anywhere in `components/admin/admin-shell.tsx`'s `NAV_GROUPS`.
Key files (backend-only, unused by any current UI): `app/api/admin/shipping-rules/route.ts` (GET list, POST create), `app/api/admin/shipping-rules/[id]/route.ts` (GET one, PATCH, DELETE), `lib/admin/shipping-overlap.ts` (`findOverlappingRules` — prevents duplicate/conflicting rules), `prisma/schema.prisma` (`ShippingRule` model). Live shipping calculation instead uses `lib/shipping/egypt-post-phase1/constants.ts` + `calculator.ts`, surfaced through `lib/services/shipping.ts` — none of this is admin-editable through any UI, it's hardcoded in source.

## Current state: this screen does not exist

There is no admin shipping UI in the current codebase. This file exists to document that clearly (so the redesign doesn't try to "restore parity" with a screen that was never built) and to record the two shipping-related backends that do exist, in case the redesign/PM wants to decide whether to finally build a UI for either of them.

## What actually determines shipping cost today (no admin control)

`lib/services/shipping.ts` carries this comment verbatim: *"Phase 1 shipping: Egypt Post Wasalha only. Single carrier; origin Cairo; governorate → zone → calculator. Old providers (Turbo, DB-based Egypt Post rules) and carrier selection are removed for Phase 1."*

Concretely, every shipping fee shown at checkout today is computed by `calculateShippingPhase1()` in `lib/shipping/egypt-post-phase1/calculator.ts`, using constants hardcoded in `lib/shipping/egypt-post-phase1/constants.ts`:
- Egypt's 27 governorates are pre-mapped (Arabic + Latin variants, fuzzy-matched) into 6 fixed zones: `CAIRO_METRO`, `ALEX_DELTA`, `CANAL`, `NORTH_UPPER`, `SOUTH_UPPER_REDSEA`, `REMOTE`.
- Each zone has a fixed base EGP price from Cairo (`CAIRO_ORIGIN_PRICE_TABLE`: 55/65/70/75/100/110 EGP).
- First 2kg included in base; extra weight billed at 7 EGP/kg (rounded up).
- A flat 0.50 EGP insurance fee and 14% VAT are added to get the courier-facing (Egypt Post-visible) price.
- On top of that, the customer-facing price adds a hidden shop margin (10% of base+extra weight, floor 5 EGP) and a flat 8 EGP "prep service fee" — both invisible to the courier/partner export, only shown to the customer.
- **None of these numbers (zone mapping, base prices, weight tiers, VAT rate, margin, prep fee) are configurable anywhere in the running app.** Changing any of them requires a code change and redeploy.

## The orphaned `ShippingRule` backend

A separate, fully-built CRUD backend for admin-configurable shipping rules exists and still compiles/runs, but is **not wired into the live shipping calculation and has no UI**:
- `ShippingRule` model: `provider`, `governorate`, optional `city`/`area` (progressively more specific targeting), `weightMin`/`weightMax` (grams), `feePiastres`, `priority` (higher = preferred on overlap), `active`.
- `GET/POST /api/admin/shipping-rules` and `GET/PATCH/DELETE /api/admin/shipping-rules/[id]` — full admin-gated (`requireAdmin()`) CRUD, Arabic error messages, matches the same conventions as every other admin API route in this app.
- `lib/admin/shipping-overlap.ts` — on create/update, rejects a rule whose (provider, governorate, city, area) destination and weight range overlaps an existing rule ("تداخل مع قاعدة شحن موجودة"), returning the conflicting rule IDs.
- This was very likely the old (pre-"Phase 1") shipping-rate system — the comment in `lib/services/shipping.ts` explicitly says DB-based Egypt Post rules were "removed for Phase 1" in favor of the hardcoded calculator. The API/model were left in place (either intentionally, for a future phase, or as unfinished cleanup) but no page in `app/(admin)/admin/shipping/` ever consumed them.

## Business requirements (for the PM/redesign decision, not "current UI" parity)
- **Goal/KPI if built**: ops-efficiency and margin control — today, any shipping-rate change (e.g. a courier price increase, a new zone) requires an engineer to edit constants and redeploy. An admin-editable rate table would remove that bottleneck. This is a **build decision**, not a parity requirement — flag to the PM via `02-proposals.md` rather than assuming the redesign should silently add a shipping-rules screen.
- **Trust/credibility signals**: shipping-cost accuracy directly affects checkout trust (customers expect the quoted shipping fee to match what's actually charged) — this makes the *calculator*, not the missing admin screen, the trust-critical piece; it's covered by whichever inventory file documents checkout.
- **Friction points**: engineering-dependency on rate changes (above) is the main one. A secondary friction point is that two competing data models exist in the codebase (`ShippingRule` vs. the hardcoded Phase 1 constants) — a rebuild that naively resurrects a "shipping" admin screen from the `ShippingRule` API would build a screen that edits data the checkout flow never reads, silently doing nothing. This must not happen without an explicit decision from the PM.
- **Compliance/legal**: none beyond general clear-pricing norms already covered by the checkout inventory.

## States / Edge cases / Elements & behavior
Not applicable — there is no UI to describe. If the PM/redesign decides to build this screen, it should be scoped as new work against the live `egypt-post-phase1` calculator (rewriting it to read admin-configured zone/rate/weight-tier data instead of constants), or against reviving the orphaned `ShippingRule` API (and wiring it into `lib/services/shipping.ts` in place of the Phase 1 calculator) — either is a real technical decision, not a redesign detail, and belongs in `02-proposals.md`/`03-backlog.md`, not invented here.

## Notes
- **Do not build a shipping admin screen against `ShippingRule` without first wiring it into `lib/services/shipping.ts`.** As of this inventory, saving/editing `ShippingRule` rows via its API has zero effect on any real order's shipping fee.
- The sidebar (`AdminShell`) has no "الشحن" (Shipping) nav item at all — confirms this isn't a temporarily-hidden or in-progress screen, it's simply unbuilt.
- `GOVERNORATE_OPTIONS` (used across rerouting-rules, clients, checkout) and the Phase 1 calculator's own governorate→zone map (`GOVERNORATE_TO_ZONE_RAW` in `constants.ts`) are two independently maintained lists of the same 27 governorates — worth consolidating in any future shipping work, but out of scope for this inventory.
