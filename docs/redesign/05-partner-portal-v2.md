# Partner portal v2 — plan

Status: **planned, not started** (2026-09-13). Supersedes the Phase 4 "Partner portal" surface (4.16–4.23, shipped v2.1.0) as the target; the shipped code is the starting point, not a throwaway — its API routes, locking rules, ledger writes, fixtures and specs carry over wherever the screen keeps its behaviour.

Why: the user reviewed the shipped surface and rejected it on three grounds — the look (dark rail, bordered panels), the workflow (nav organised by database entity, not by the partner's day), and the reporting (four disconnected lists with no period, no comparison, no action). The inspiration screenshot (light SaaS dashboard: white sidebar, soft grey ground, rounded cards, KPI tiles with delta pills, trend chart, date widget, compact table with soft status pills) sets the visual direction.

## 1. Decisions taken with the user (2026-09-13)

| Topic | Decision |
|---|---|
| Look | Light shell like the inspiration; **lapis/gold stay the accents, Cairo stays the type**. Not the inspiration's teal palette. |
| Home | **Action queue first**; a compact KPI row + trend chart above it for context. |
| Dynamic settings | Per-category / per-product low-stock thresholds; alert rules; delivery areas served; handover method; working days, daily order capacity, SLA hours. **Not** customisable order stages (declined — every partner keeps the full lifecycle). |
| Areas / capacity | **Inform only**: capacity meter on home, visible to admin; routing rules stay admin-managed by governorate. Routing effects are a later decision. |
| Reports | **All five families this round**: Sales, Fulfilment, Inventory, Network (agents), Money. |
| Settlement model | **Wholesale at a transfer price**: the partner buys stock from the factory at a percentage of the selling price and keeps the rest. **The rate is per partner, set by admin** (user update 2026-09-13 — not a fixed 75/25; e.g. one partner 72%, another 75%); it lives on the partner record, is read-only in the partner's settings, and applies to every product. The partner **owes the factory when stock is received** (each FACTORY receipt creates the debt) and **pays it back as a down payment plus installments**, which admin records. There is no cost price field — cost is derived: `unitCost = round(pricePiastres × partner.costRate)` snapshotted on the receipt line at receipt time, so a later rate change never rewrites history. |
| Out of scope | Returns (no returns feature exists → Phase 5); senior verification; customisable stages; routing effects of areas/capacity; per-partner rates. |

**Confirmed 2026-09-13:** the partner collects the money for the goods they sell — COD at delivery and InstaPay into the partner's own account (which is why `lib/checkout/instapay.ts` selects the InstaPay account per partner). Nothing is held by the company. The Money report therefore has two independent sides: what the partner owes the factory for stock received (minus payments), and what the partner has collected or is still waiting to collect from customers.

## 2. Information architecture

Organised around the partner's day, not the tables. Six top-level items; role differences are inside sections, not separate menus.

| Nav | Route | Replaces |
|---|---|---|
| اليوم | `/partner` | النظرة العامة |
| الطلبات | `/partner/orders` (+ `/partner/orders/[id]`) | `/partner/routed-orders`, `/partner/orders/[id]` (old route redirects) |
| المخزون | `/partner/stock` with tabs: المخزون · الحركات · الاستلام من المصنع · الجرد · طلبات التوريد | `/partner/products`, `/partner/receipts/**`, `/partner/restock-requests`, `/partner/distributor-requests` (old routes redirect to the tab) |
| الشبكة (AGENT) | `/partner/network` | `/partner/distributors` |
| التقارير | `/partner/reports/{sales,fulfilment,inventory,network,money}` | `/partner/reports` |
| الإعدادات | `/partner/settings` (sectioned) | `/partner/settings` |

The **routing status** (`RoutedOrder.status`) disappears from every partner screen: on the redesign data 1,002 of 1,083 routed rows are stuck at `ASSIGNED` and none was ever marked delivered — `Order.status` is the real lifecycle and `DELIVERED` is the delivery signal everywhere in v2. (The Order/RoutedOrder auto-propagation stays an admin-side backlog item.)

## 3. Design round (before any implementation)

A new Claude Design canvas, `design-canvas/partner-v2/`, replaces `PartnerOrders-Desktop.dc.html` as the partner design source. The user reviews and approves the canvas **before** tasks are written — the previous surface was built without a user look at the screens, which is how we got here.

Artboards (desktop 1440 and mobile 390 unless noted):
1. Shell + اليوم (home): white sidebar 248px on `stone-50`, identity block, sectioned nav with a soft active pill; topbar with the date widget and the bell; KPI row (four tiles: icon well, value, secondary line, delta pill vs previous period); 30-day trend chart (revenue, orders toggle); capacity meter; the action queue (grouped rows with a next-action button each).
2. الطلبات pipeline: stage tabs with counts, filter chips, the compact table (soft status pills with the leading dot), selection + bulk bar, pick-list print preview.
3. Order detail: items, customer, timeline from the audit log, next-action, notes.
4. المخزون hub: tab bar, the stock table (sellable, reserved, days of cover, threshold badge), quick +N, low-stock filter; the intake flow (export → edit → import preview → apply) as a stepper; a receipt detail (printable).
5. التقارير — Sales (representative report: period picker with comparison, headline tiles with deltas, chart, breakdown tabs, action panel, export) and Inventory (dead stock, stock-outs, suggested reorder list with "send to factory" export).
6. المال (Money): balance card (owed − paid − held), receipts ledger, payments list, COD collected/pending.
7. الإعدادات: sectioned page — working profile, thresholds (category/product table with overrides), alerts, areas, handover.
8. Mobile: home, orders, stock table, one report (390).
9. Components sheet: KPI tile, delta pill, status pill with dot, soft card, period picker, capacity meter, stepper, empty/error/skeleton states.

Tokens: keep `tailwind.config.ts` lapis/gold/stone; add the v2 surface tokens (card radius 16, shadow-soft, `stone-50` ground, active-pill `lapis-50`/`lapis-800`), documented in `01-design-system.md` as the "partner v2 canvas" section.

## 4. Screens — business and technical requirements

Each task below is written for the implementer/verifier loop (`03-backlog.md` rules 1–10 of the partner section still apply, plus the standing rules in §6). Order of build in §7.

### 4.1 Foundation: schema, settings model, shell restyle
Business: everything else reads the partner's working profile, so it ships first; the shell changes look without changing what a partner can reach.
Technical (all additive, one `db:push:redesign`):
- `Partner.costRateBps Int @default(7500)` — the partner's buying rate in basis points (7500 = 75%), admin-only write; `SiteSetting partner_default_cost_rate_bps` seeds new partners. One helper `getPartnerCostRate(partnerId)`.
- `Partner`: `workingDays String[]` (ISO day codes, default all seven), `dailyOrderCapacity Int?`, `confirmSlaHours Int @default(24)`, `shipSlaHours Int @default(48)`, `handoverMethod HandoverMethod @default(COURIER)` (`COURIER | PICKUP | OWN_DELIVERY`), `serviceAreas Json?` (`{ [governorate]: string[] }`), `alertPrefs Json?` (`{ [alertKind]: boolean }`, missing = on).
- New `PartnerStockThreshold { id, partnerId, categoryId?, productId?, threshold Int }` with unique `(partnerId, categoryId)` and `(partnerId, productId)`; resolution order product → category → `Partner.lowStockThreshold`. One helper `resolveThreshold(partnerId)` returns a lookup used by home, alerts, stock table and the inventory report — the four places that today each compare against the single number.
- `StockReceiptLine.unitCostPiastres Int?` and `StockReceipt.totalCostPiastres Int?` — set for `FACTORY` receipts at apply time from the variant's `pricePiastres × rate`; `COUNT` receipts never create a cost (a count is a correction, not a purchase — if a count *raises* stock the receipt detail shows a "لم يُحتسب كشراء" note).
- New `PartnerPayment { id, partnerId, kind PartnerPaymentKind (DOWN_PAYMENT | INSTALLMENT), amountPiastres, paidAt, stockReceiptId?, dueAt?, reference?, notes?, recordedByUserId, createdAt }` — admin-recorded only (`POST /api/admin/partners/[id]/payments`, a small admin form on the existing partner edit page); a down payment links to the receipt it was paid against; an installment may carry a `dueAt` so the Money page can show "القسط القادم". Partners read it.
- Settings shows a read-only "حسابك مع المصنع" section: the rate, the margin, and "دفعة مقدمة + أقساط" — informational, edited by admin only.
- Shell: `PartnerShell` restyled to artboard 1; `partner-nav-config.ts` rewritten to §2; old routes become `redirect()`s. Admin keeps working (shared dashboard primitives get the v2 look; screenshot `/admin/orders`).
- Settings page: sectioned (react-hook-form + Zod per section, save per section): working profile, thresholds table (category rows with an override field, product search to add product overrides), alert kinds toggles, service areas (governorate multi-select → areas), handover method. `GET/PATCH /api/partner/settings` grows to carry all of it; thresholds via `PUT /api/partner/settings/thresholds`.
- Fixtures: `seedPartnerPair()` gains options for capacity/SLA/thresholds; cleanup covers the new tables.

### 4.2 اليوم (home)
Business: the page answers "what do I do now?" — every row has one obvious next action; the numbers above are context, not the point.
Technical:
- `GET /api/partner/today` → `{ kpis, capacity, queue, trend }`. KPIs: orders today, revenue this week (with previous-week delta), sellable units, overdue count. Capacity: `dailyOrderCapacity` vs orders confirmed/processing today (null capacity → meter hidden). Trend: 30-day daily revenue+orders for `assignedPartnerId` (reuse `getRevenueOverTime` with a partner scope). Queue groups, each with its next action wired to the existing transition endpoint: to confirm (`CREATED`), to prepare (`CONFIRMED`), to hand over (`READY_TO_SHIP`), overdue (entered `CONFIRMED`/`PROCESSING` longer than the partner's SLA hours ago — computed from the latest `OrderAuditLog` status row, replacing the hard-coded 24h), incoming restock requests (agent) / decisions on mine (distributor), low stock (top lines by lowest sellable vs the resolved threshold, link to the stock tab filtered).
- Working days: on a non-working day the queue header says so and the capacity meter is hidden; nothing is blocked.
- Alerts bell stays (computed feed), now filtered by `alertPrefs`.

### 4.3 الطلبات pipeline
Business: a partner works orders in batches by stage; bulk actions and a printable pick list are the daily tools.
Technical: `/partner/orders?stage=` with tabs `CREATED | CONFIRMED | PROCESSING | READY_TO_SHIP | SHIPPED | DELIVERED | CANCELLED` and counts from one `groupBy`; the shipped `DataTable`, bulk bar and per-row next-status button carry over unchanged in behaviour (same `lib/orders/partner-status-transition.ts`, same locks, same audit rows); new: "طباعة قائمة التجهيز" for the selection (print-only route `/partner/orders/pick-list?ids=` using the receipts print pattern, `data-partner-chrome` hidden); order detail gains the audit-log timeline. Routing status removed from the table and detail.

### 4.4 المخزون hub
Business: one place for everything about stock — what I have, what moved, what came from the factory, what I counted, what I asked for / was asked for.
Technical: tabs are client routes under `/partner/stock/*`; the products table, quick +N, low-stock filter, export/import/apply, receipts and restock screens move in with their APIs unchanged; new: a movements tab over `InventoryLedger` (period filter, reason chips, running balance per variant), threshold badges use `resolveThreshold`, and a "مقترح إعادة الطلب" button on the stock tab that opens the Inventory report's reorder list.

### 4.5 الشبكة (AGENT)
Business: the agent sees each distributor's health at a glance and acts on their requests from the same place.
Technical: roster cards (name, phone, active, sellable units, pending requests, last activity) with a detail drawer: their stock (existing inline query), their requests, their fill rate. No new mutations.

### 4.6 Reports — the model
Every report: a **period** (presets: today, 7d, 30d, this month, last month, custom) with **comparison** to the previous equal period (deltas on every headline), a **question** it answers, and an **action** list at the end. One API shape for all five: `GET /api/partner/reports/{family}?from&to&groupBy&page` → `{ period, comparison, headline: [{ key, label, value, previous, delta }], series, breakdowns: { [name]: rows }, actions: [{ label, href | export }] }`. Tables >200 rows are server-paginated (this closes the ~3k-row follow-up); CSV export streams the whole set. Money values in piastres, formatted client-side.

| Family | Question it answers | Headline | Breakdowns | Action |
|---|---|---|---|---|
| Sales | How much did I sell, and is it growing? | revenue, orders, units, average order, cancellation rate | by day (chart), product, category, governorate/area, payment method | top movers → link to stock |
| Fulfilment | How fast and how reliably do I fulfil? | median time to confirm, to ship, overdue rate, cancellation rate + reasons, delivered rate | by week; slowest orders list | overdue list → pipeline |
| Inventory | What should I restock, and what is dead? | sellable units, valuation at cost (rate) and at price, days of cover (median), dead-stock count, stock-out days | per SKU: velocity, cover, dead (no sale in N days, N a setting default 60), stock-out days from the ledger; **suggested reorder qty** = target cover days × velocity − sellable | reorder list → CSV in the factory intake format |
| Network (agent) | How are my distributors doing? | active distributors, units transferred, requests pending, fill rate | per distributor: sales, sellable, requests, fill rate (fulfilled ÷ requested from `RestockRequestItem`; verify it carries a fulfilled quantity, else fulfilled = requested on `FULFILLED`) | distributors under threshold → network page |
| Money | Where do I stand with the factory and with cash? | factory side: owed for stock received (Σ receipt `totalCostPiastres`), down payments + installments paid, **balance**, next installment due; cash side: collected (`DELIVERED`, COD and InstaPay), COD pending (`COD` + `SHIPPED`), margin estimate (`1 − costRate` of delivered merchandise) | receipts ledger, payments list (kind, receipt link), collected by week and by method | export statement |

Timing metrics come from `OrderAuditLog` (`status_change`/`confirmed` rows with `createdAt`); orders assigned before the log existed are excluded from timing averages and counted in a "بدون توقيت" footnote.

### 4.7 Admin-side minimum
Not an admin rebuild: (a) record a partner payment; (b) edit `partner_cost_rate`; (c) see each partner's working profile read-only. Three small additions on existing admin pages, each behind `requireAdmin()`.

## 5. Schema summary (additive only)
`SiteSetting partner_cost_rate` · `Partner.{workingDays, dailyOrderCapacity, confirmSlaHours, shipSlaHours, handoverMethod, serviceAreas, alertPrefs}` · `HandoverMethod` enum · `PartnerStockThreshold` · `StockReceiptLine.unitCostPiastres` · `StockReceipt.totalCostPiastres` · `PartnerPayment`. `prisma migrate diff` must be additive; no column is dropped (`RoutedOrder` stays, just unshown).

**Deploy note (backlog 9.9, added 2026-09-14) — the one exception to "additive only" above.**
`prisma/migrations/20260914120000_drop_variant_legacy_stock` drops `Variant.stockAvailable`/
`stockReserved` and their index — stock has lived only in `PartnerInventory` since this file's
§1 decisions, and every remaining reader/writer of the two Variant columns was migrated off them
in 9.9. On the redesign Neon branch this data is disposable and the migration runs immediately
(`db:push:redesign`). **For production**: do not run this migration until a reconcile query
confirms production's `Variant.stockAvailable`/`stockReserved` sums are either zero, or any
nonzero remainder is already accounted for in the matching partner's receipts/`PartnerInventory`
row (the same discipline `20260806090000_backfill_routed_order_partners_and_reconcile_gamal_inventory`
used for the one partner that predated partner-scoped inventory) — otherwise the drop silently
discards real, unreconciled stock counts with no way to recover them.

**Deploy note (backlog 9.10, added 2026-09-14) — admin v2 close-out, env additions and migration order.**

Environment variables added since v2.3 (in addition to `CRON_SECRET` above, unchanged):
- `ALLOW_TEST_UPLOAD_FOLDER` — backlog 9.8a's `POST /api/admin/upload` folder override
  (`nile-kings/products/e2e-*`), used only by `admin-v2-media.spec.ts` to scope and clean up
  its own Cloudinary uploads. Set **only** by `playwright.config.ts`'s `webServer.env` and by
  `loadRedesignTestEnv()` for the test process itself — **never** set this in `.env`,
  `.env.redesign`, or any production/staging environment; `lib/media/test-upload-folder.ts`'s
  guard also requires non-production `NODE_ENV`, but the env var is the primary gate.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — backlog 9.8a's
  Cloudinary Admin API credentials (`lib/media/cloudinary-admin.ts`), needed for `POST
  /api/admin/upload` (unsigned upload signing) and `POST /api/admin/media/sync` (listing
  `nile-kings/products`/`nile-kings/routed-proofs` to reconcile the `MediaAsset` table). Both
  routes degrade gracefully (`isCloudinaryConfigured()`) when unset, but the الصور library and
  every product-image upload are non-functional without them — set all three in production
  before deploying 9.8a/9.8b.

Prisma migrations, **in this order**, before deploying 9.10 (backlog "Admin v2" chapter) to
production:
1. **`20260914110000_admin_and_partner_v2_additive`** — every additive change since the last
   production migration (`20260806093000_…`): the account v2 tickets, the partner portal v2
   tables and fields, and admin v2 (`AdminAuditLog`, `MediaAsset`, `VariantImage`,
   `Variant.active`, `Category.imageUrl`, `StockReceipt.recordedBy`). Generated by the PM at
   9.10 close-out with `prisma migrate diff` between the schema at that last migration and the
   schema just before 9.9's drop; it contains no DROP. It assumes production is exactly at the
   last migration — confirm first with `prisma migrate diff --from-url <prod> --to-migrations
   prisma/migrations` (expect an empty diff once this file is included), then `migrate deploy`.
2. **9.9's `20260914120000_drop_variant_legacy_stock`** — drops `Variant.stockAvailable`/
   `stockReserved` and their index. Per this file's own 9.9 deploy note above, **do not run
   this against production** until a reconcile query confirms production's
   `Variant.stockAvailable`/`stockReserved` sums are either zero or already accounted for in
   the matching partner's `PartnerInventory` row — the drop is irreversible.

**One-time media sync after deploy**: once 9.8a is live and the three `CLOUDINARY_*` variables
are set, `MediaAsset` starts empty in production — every asset already in Cloudinary (every
product/variant image, every delivery proof) exists on disk but has no registered row, so the
الصور library shows nothing and every usage/orphan count reads zero. Run the reconcile once,
either by clicking "مزامنة" on `/admin/products` → `الصور` (`POST /api/admin/media/sync`,
paginated — the UI re-POSTs with `?cursor=continue` until it reports done) or by calling that
endpoint directly with an admin session. Safe to re-run; it is the same reconcile the ongoing
sync uses, incremental and idempotent.

## 6. Rules carried over and added
Carried: every stock read-modify-write holds `SELECT … FOR UPDATE`; every mutation writes `InventoryLedger` in the same transaction; role gates server-side; dialog focus at the primitive; chrome never prints; skeleton/alert/wrong-role states; RTL, keyboard, real labels; `dev:redesign` only, `db:push:redesign` only, fixtures under the production guard; verify at 1440×900, 1514×681, 1366×768, 1280×720, 1024×768, 768×1024, 390×844 against the **new** artboards.
Added: (11) the user approves the canvas before implementation tasks are written; (12) every number on a report has a period and a comparison, or it is not a report; (13) thresholds resolve through `resolveThreshold()` — no screen compares against `Partner.lowStockThreshold` directly; (14) cost is never stored on the variant; it is snapshotted on the receipt line at apply time from the rate.

## 7. Order of work
0. Design round (§3) → user review → corrections → approval.
1. 5.1 Foundation (schema, settings, shell, redirects, admin minimum) — alone.
2. 5.2 Home and 5.3 Orders — parallel worktrees.
3. 5.4 Stock hub and 5.6a Reports API + Sales + Inventory — parallel.
4. 5.5 Network, 5.6b Fulfilment + Network + Money reports — parallel (Money only after the §1 open assumption is confirmed).
5. Retire old specs, full suite, `npm version minor` → v2.2.0.

## Environment

- `CRON_SECRET` — bearer token guarding `GET /api/cron/stock-snapshot` (backlog 7.5). Set in
  each worktree's own `.env.redesign` (never committed); the e2e suite reads it via
  `process.env.CRON_SECRET` after `loadRedesignTestEnv()`. Vercel's own cron invocations
  supply the same value from the project's environment variables in production.
