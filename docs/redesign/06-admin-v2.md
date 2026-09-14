# Admin dashboard v2 — the operations console

Status: **shipped v2.4.0** (2026-09-14; approved as the basis for the canvas 2026-09-13, revisions the same day: catalog ownership, media library, control matrix, audit log screen; priority tool discarded; applications and admins are tabs). User direction: "you should propose and redesign the dashboard logically, not just as a style. Make the admin's life easier, control the things we already need in the partner dashboard, and remove anything that has no necessity."

## 1. What the admin is for

The admin is the factory's operations desk. One person (sometimes two) opens it several times a day to answer four questions, in this order:

1. **What needs me right now?** Orders no partner has picked up, orders a partner is late on, customer questions waiting, partner applications waiting, stock about to run out somewhere, money a partner owes.
2. **Where is this order and who has it?** One order, one status, one partner, one place to fix it.
3. **How are my partners doing, and what do they owe me?** Per partner: orders, lateness, stock, balance with the factory, and the knobs that govern them.
4. **What should I change?** Catalog, prices, coupons, rates, rules.

Everything on the admin either serves one of those four or goes.

## 2. What exists today and the verdict on each

| Today (14 nav items) | What it really is | Verdict |
|---|---|---|
| لوحة التحكم | Lifetime revenue KPIs (since 1970), four quick links, a "التقارير" button top-left | **Rebuild** as "اليوم": an action queue first, numbers second. The reports button goes — reports live in the nav only. |
| الطلبات | v1 orders list + detail (`Order.status` is the real lifecycle) | **Rebuild** on the partner v2 orders pipeline, generalised: a partner column, filters by partner/governorate, reassign, proof of delivery, item edits, bulk status. |
| أسئلة العملاء | The ticket inbox from 6.5b | **Keep** (restyle in the v2 language when the shell lands). |
| الطلبات الموجهة | A second status machine (`RoutedOrder`) that nobody drives: 1,002 of 1,083 rows stuck at ASSIGNED, none ever marked delivered. Partner v2 already dropped it from every partner screen. | **Remove the screen.** Keep its two useful powers — reassign to another partner, delivery-proof photo — inside the order detail. The propagation rule from 2026-09-10 (order cancelled → routing cancelled; routing delivered → order delivered) becomes the only sync. |
| قواعد التوجيه | Governorate → partner round-robin, one rule per governorate, partners added one at a time | **Fold into الشركاء → التوجيه** as a single governorate matrix: every governorate on one page, its partners, order volume per partner, unrouted count highlighted. No separate list/new/detail trio. |
| المنتجات / الفئات / الكوبونات | Catalog | **Keep**, restyle on the v2 shell; products gain the per-colour gallery (Phase 5) and bulk edit. |
| مخزون الشركاء | Pick a partner, then edit rows; no cross-partner view | **Fold into الشركاء**: a network stock view (every partner × low-stock SKUs, sortable by days of cover) plus the same editable grid on each partner's profile. The `MANUAL_ADJUSTMENT` ledger row on every edit stays. |
| العملاء | List + detail | **Keep**, restyle. |
| المسؤولون | A filtered list of users with role ADMIN + grant/revoke | **Fold into العملاء** as a role tab ("المسؤولون"), same grant/revoke actions. |
| الشركاء | Applications + agents + distributors + a read-only dialog with cost rate and payments | **Rebuild** as the partner hub (see §3.4). This is the centre of admin v2. |
| التقارير (`/admin/analytics`) | v1: delivered-only, lifetime, a 3k-row variant table, a CSS bar chart, a Redis cache that never hits | **Replace** with the partner v2 reports platform run network-wide (§3.6). The v1 page, its export routes and the dead cache go. |
| الإعدادات | COD fee + OTP, two separate saves, no confirm; senior-promo toggle built but never rendered; shipping rates hardcoded | **Rebuild** as grouped settings with a confirm on anything that changes prices (§3.7). |

Result: **9 nav items** instead of 14, and every remaining item answers one of the four questions.

## 3. The new information architecture

### 3.1 اليوم (home)
- **Queue** (top, always): counts with links, sorted by urgency — بلا شريك (unrouted orders), متأخرة عند الشريك (SLA breached per the partner's own `confirmSlaHours`/`shipSlaHours`), أسئلة بانتظار الرد, طلبات شراكة جديدة, أصناف نافدة أو قاربت (network-wide, per partner threshold), مستحقات شركاء (down payment or instalment past `dueAt`).
- **Numbers** (below): today / 7d / 30d with comparison, from the same report platform the partners use: orders, delivered revenue, cancellation rate, on-time rate. No lifetime totals anywhere.
- **Recent**: the last ten status changes across the network with who did them (the audit log the proposals already approved).
- Gone: the four quick-link tiles, the "التقارير" button.

### 3.2 الطلبات
- The partner v2 pipeline (stage tabs with counts, search, governorate, payment, overdue) plus a **partner** filter and column, and an **unrouted** stage that partners never see.
- Row actions: next status, open. Bulk: status change, assign to partner, print picking list.
- Detail: the partner v2 order detail (items with edit and recompute, money box, timeline) plus admin-only powers: **assign / reassign partner** (moves the reservation, writes the ledger — the existing `reassignReservedPartnerStock`), **proof of delivery** (upload, view), **cancel with reason**, the customer's ticket thread if one exists.
- Manual order creation stays (`/admin/orders/new`), reached from the pipeline header.

### 3.3 أسئلة العملاء
- As shipped in 6.5b, restyled. The open count also feeds the home queue.

### 3.4 الشركاء (the hub)
- **List**: every agent and distributor with health at a glance — open orders, overdue %, days of stock cover, balance owed to the factory, active/inactive. Search, filter by type/governorate/health. Applications ("طلبات الشراكة") are a tab here with a pending-count badge, not a separate nav item (PM decision 2026-09-13, user delegated: an application is a partner-to-be and is reviewed with the roster in view).
- **Partner profile** (`/admin/partners/[id]`), tabs:
  - **الملف**: identity, contact, socials, linked agent, active toggle (8.2's form, moved here).
  - **الأداء**: this partner's own reports (sales, fulfilment, inventory) — the same pages the partner sees, read by the admin.
  - **الطلبات**: the pipeline filtered to this partner.
  - **المخزون**: the editable grid from today's مخزون الشركاء, per partner, ledger-backed.
  - **الحساب المالي**: cost rate, receipts (what they took from the factory at what rate), payments recorded, running balance, next `dueAt`. Record a payment here (5.1's panel, moved).
  - **الإعدادات**: every knob partner v2 introduced, admin-controlled in one place — `confirmSlaHours`, `shipSlaHours`, `workingDays`, `dailyOrderCapacity`, `lowStockThreshold`, `deadStockDays`, `targetCoverDays`, `costRateBps`. Today these are scattered or partner-editable; the admin gets them all with the partner's current values and the network default beside each.
- **التوجيه** (tab): the governorate matrix described in §2 — every governorate on one page with its partners (add/remove, pause), order volume per partner over the last 30 days, and a highlight on any governorate with no active partner (counted on the home queue as بلا شريك). Round-robin order stays as today (creation order); **the priority-ordering tool is discarded for now (user, 2026-09-13)** — `ReroutingRulePartner.priority` is left untouched and not surfaced. Manual mode per governorate stays available.
- **مخزون الشبكة**: the cross-partner low-stock view.

### 3.5 الكتالوج — the admin owns the catalog, the partner owns only stock

**Ownership model (the rule everything else follows).** The admin creates and edits products, categories, variants (size × colour), prices, descriptions, tags, weights and every image. The partner never creates or edits any of that; a partner only enters **how many of each admin-defined variant they hold** (`PartnerInventory`), through intake receipts, counts, adjustments and transfers. The storefront sells from partner stock by governorate and never from the variant's legacy `stockAvailable` column (`lib/storefront-location.ts` already refuses that fallback). Consequences:
- `Variant.stockAvailable` / `stockReserved` are legacy: no admin screen edits them any more, the admin variant form drops those two fields, and a later cleanup task removes the columns once `lib/catalog.ts`, `lib/cart/cart.ts`, `lib/analytics/queries.ts`, `lib/catalog-export.ts` and `lib/inventory/receipts.ts` are migrated to partner stock. Until then they are read-only and hidden.
- A variant that no partner stocks is still a real product on the storefront (shows as unavailable in that governorate); a partner cannot invent a variant the admin did not define.
- `PartnerStockThreshold` (per category/product alert level) stays partner-owned: it only changes that partner's alerts.

**Product structure the admin edits.** Product → colours → sizes. Today a colour is several `Variant` rows (one per size) sharing `colorName`/`colorHex`; the admin form is rebuilt around that reality: a product page with a **colour** panel (name, hex, gallery, representative image, active) and a **sizes** grid per colour (SKU, size, price, base price, active), with bulk add of the standard size run per colour. Everything the API accepts today is preserved; the form stops asking for stock.

**Images: a media library, not loose URLs.** Today an upload goes to Cloudinary (`nile-kings/products`), the response's `public_id` is thrown away, only the URL is stored on `Product.imageUrl` / `Variant.imageUrl`, and `VariantImage` (the per-colour gallery added for the PDP) has **no writer at all** — the admin cannot build a gallery. Admin v2 fixes this with one table and one screen:
- `MediaAsset { id, publicId @unique, url, width, height, bytes, format, folder, alt?, uploadedByUserId, createdAt }` — every Cloudinary upload made through the site is registered here at upload time. `VariantImage` gains `assetId` (nullable for the rows that predate it), `Product.imageUrl` / `Variant.imageUrl` keep working but the admin UI sets them by picking an asset.
- **الصور** (media library, under الكتالوج): a grid of every asset with its usage — which product, which colour, hero or gallery, or **غير مستخدمة**. Filters: product, colour, unused, uploaded-by, date. Actions: upload (multi-file, drag-drop, registered on the spot), assign to a product colour's gallery (reorder by drag, pick the representative), set as product hero, replace, delete. Delete is refused while the asset is in use; deleting an unused asset calls Cloudinary `destroy` and removes the row (audit-logged). An **"مزامنة مع Cloudinary"** action lists the folder through the Cloudinary Admin API and reconciles: assets in Cloudinary but not registered are imported as unused; registered rows whose asset is gone are flagged broken. This is how the existing uploads become manageable without touching them by hand.
- On the product page the colour panel shows its gallery inline (add from library or upload, reorder, remove) so the everyday flow never leaves the product; the library is the cross-cutting view.
- Storefront: the PDP gallery (`VariantImage` by `colorKey`) and the card/cart representative image keep reading the same fields — no storefront change in this task beyond images finally existing.

**Bulk edit** (Phase 5, approved): select products → change category, active, tags, price by amount or percent, with a preview of affected variants and a confirm; audit-logged.

**Categories** stay as today (name, slug, sort, image from the library).

### 3.6 التقارير
- The partner v2 report platform (period + comparison + headline + series + breakdowns + CSV) run for the whole network, with **partner** as a first-class breakdown: المبيعات (by partner, governorate, category, product), التجهيز (on-time, overdue, cancellation reasons by partner), المخزون (network cover, dead stock, out-of-stock by partner, the daily snapshot comparison from 7.5), المال (what each partner owes, payments received, receipts issued).
- v1 analytics, its CSV routes and `lib/cache/analytics.ts` are deleted once parity is verified.

### 3.7 الإعدادات
- **المتجر**: COD fee, senior-citizen promo toggle (finally rendered), shipping rates when the admin-editable calculator lands (Phase 5, seeded with today's constants).
- **الشركاء**: network defaults for every knob in §3.4 (new partners inherit them).
- **الأمان**: OTP rules.
- One save per group, a confirm dialog on anything that changes a customer's price, and the change written to the audit log with the old and new values.

### 3.8 العملاء
- List and detail as today, restyled; a **المسؤولون** tab with grant/revoke (8.3) — a tab, not a nav item (PM decision 2026-09-13, user delegated: an admin is a user with a role, and the grant action already starts from a customer's profile).

### 3.9 السجل (audit log)
- Its own nav item, not a footnote. One `AdminAuditLog { id, actorUserId, actorRole, action, entityType, entityId, entityLabel, before Json?, after Json?, reason?, ip?, createdAt }` written by every admin and partner write that changes money, stock, status, catalog, routing, roles or a setting (rule B1). The existing `OrderAuditLog` keeps feeding order timelines and is mirrored into the new table so one screen shows everything.
- Screen: a reverse-chronological list with filters by actor, entity type, entity (search by order id, partner, product, SKU), action and date; each row expands to a before/after diff in plain words ("نسبة الشراء: 75% → 70%"); a link opens the entity. Exports CSV for a period.
- The same log appears in context: the order detail timeline, the partner profile ("من غيّر إعدادات هذا الشريك ومتى"), the product page ("من غيّر السعر"), the settings page ("القيمة السابقة").
- Retention: kept forever for money and stock; the rest pruned after 400 days by the existing daily cron.

## 4. Shell
- Same shell component as partner v2 (light SaaS rail, collapsible from 7.1, topbar slot, mobile top bar + sheet drawer). Admin gets its own nav config and a queue badge on اليوم.
- Nav, in order: اليوم · الطلبات · أسئلة العملاء · الشركاء · الكتالوج (المنتجات، الصور، الفئات، الكوبونات) · العملاء · التقارير · السجل · الإعدادات.

## 5. What is removed
- `/admin/analytics` page, its two API routes, `lib/cache/analytics.ts`.
- `/admin/routed-orders` list and detail (powers move into the order detail); `/admin/rerouting-rules` list/new/detail (replaced by the matrix); `/admin/partner-inventory` (moved into the hub); `/admin/admins` (a tab).
- The dashboard's "التقارير" button and its quick-link tiles.
- Nothing under `app/api/**` that a remaining screen or the storefront still calls is touched; removal is verified by grep before delete.

## 6. Standing rules
The partner v2 rules (1)–(10) and A7–A8 apply, plus: (B1) every admin write that changes money, stock, status or a setting appends an audit row with actor, before and after; (B2) the shell, `DataTable`, report platform and status pills are shared with partner v2 — no admin-only variants; (B3) an admin screen never re-implements a partner computation — it calls the same `lib/**` function with a wider scope; (B4) removing a screen requires a redirect from its old URL to its new home.

## 7. Process and order

Canvas published 2026-09-13 for approval: https://claude.ai/code/artifact/c93d7eda-325c-40c5-80ab-928749773449 — generator `design-canvas/admin-v2/build.mjs` (the partner v2 tokens, CSS, icons and primitives copied verbatim; only the nav and page bodies differ, per the user: "copy the style of the partner dashboard, don't redesign from scratch"), 13 artboards: اليوم، الطلبات، تفاصيل الطلب، الشركاء، ملف الشريك (الحساب المالي، الإعدادات)، التوجيه، مخزون الشبكة، التقارير، المنتج، الصور، السجل، الإعدادات.

1. **Canvas round** (this week): artboards for اليوم, الطلبات + detail with reassign/proof, the partner hub list + profile (الحساب المالي and الإعدادات tabs), the routing matrix, network stock, one report page, settings, the audit log, the product page (colour panel + sizes grid + inline gallery) and the media library. Published for approval like the partner v2 and account canvases; no task starts before approval.
2. Tasks after approval, numbered 9.x: 9.1 shell + nav + redirects + `AdminAuditLog` foundation (table, writer helper, mirror of order audit) — **shipped v2.3.13**; 9.2 اليوم — **shipped v2.3.14**; 9.3 orders pipeline + detail (absorbs routed-orders) — **shipped v2.3.15**; 9.4 partner hub list + profile tabs (absorbs partner-inventory, admins-into-clients), split into 9.4a (list, profile tabs, applications, ownership changes) — **shipped v2.3.16** — and 9.4b (الأداء tab, المسؤولون, redirects) — **shipped v2.3.17**; 9.5 routing matrix + network stock — **shipped v2.3.18**; 9.6 reports network-wide (deletes v1 analytics) — **shipped v2.3.19**; 9.7 settings + السجل screen — **shipped v2.3.20**; 9.8 catalog, split into 9.8a (`MediaAsset`, registered uploads, الصور library, Cloudinary reconcile) — **shipped v2.3.21** — and 9.8b (product page rebuilt around colours and sizes, galleries inline, bulk edit) — **shipped v2.3.22**; 9.9 legacy variant stock columns retired — **shipped v2.3.23**; 9.10 the 9.0 follow-ups + full suite + version — **shipped v2.4.0**.
3. Each task through implementer → verifier → PM fixes → merge, as before.

## 8. Control matrix — everything in the partner dashboard, and who controls it

Rule: if the partner does not control it, the admin does, in the hub or the catalog. Nothing is shared-write.

| Thing | Partner (their own only) | Admin | Where in admin v2 |
|---|---|---|---|
| Product, category, variant (size/colour), SKU, price, description, tags, weight, active | read | **write** | الكتالوج |
| Images (hero, colour gallery, representative) | read | **write** | الكتالوج → الصور + product page |
| Partner stock per variant (available/reserved) | **write** (intake, counts, adjustments, transfers, import) | write to correct (ledger `MANUAL_ADJUSTMENT`) | الشركاء → profile → المخزون; مخزون الشبكة |
| Intake receipts from the factory (`StockReceipt`, cost snapshot per line) | **write** (records what they took) | read; **issue** a receipt on the partner's behalf; dispute/void with reason | الشركاء → profile → الحساب المالي |
| Cost rate (`costRateBps`) and network default | read | **write** | الشركاء → profile → الإعدادات; الإعدادات → الشركاء |
| Payments to the factory (`PartnerPayment`), balance, `dueAt` | read | **write** | الشركاء → profile → الحساب المالي |
| Partner identity: name, governorate, phone, socials, linked agent, notes, active | read (name/phone/socials editable by the partner in their settings) | **write**, activate/deactivate | الشركاء → profile → الملف |
| Partner applications (طلبات الشراكة) | submit | **approve / reject / convert** | الشركاء → طلبات الشراكة tab |
| Routing: which partner serves which governorate, round-robin | read (own areas) | **write** | الشركاء → التوجيه matrix |
| Confirm SLA / ship SLA hours | today write | **admin-only** from v2 (a promise to the customer, not a preference); partner sees them | الشركاء → profile → الإعدادات + network default |
| Working days, daily capacity, handover method, service areas | **write** | read; override with a note | partner settings; admin profile → الإعدادات (read + override) |
| Low-stock threshold, per-category/product thresholds, dead-stock days, target cover days | **write** (only affects their alerts) | set network defaults; read per partner | الإعدادات → الشركاء; profile → الإعدادات |
| Alert preferences, alerts seen | **write** | none | — |
| Orders assigned to the partner: status transitions, item edits, print | **write** (own orders) | **write** on any order + assign/reassign + proof + cancel with reason | الطلبات |
| Orders with no partner (unrouted) | none | **write** (assign) | اليوم queue → الطلبات (بلا شريك) |
| Customer questions (tickets) | none | **write** (reply, close) | أسئلة العملاء |
| Restock requests distributor ↔ agent | **write** (their side) | read; cancel a stuck one with reason | الشركاء → profile → الطلبات (requests tab) |
| Partner reports (sales, fulfilment, inventory, network, money) | read own | read any partner + network-wide | profile → الأداء; التقارير |
| Coupons, COD fee, senior promo, shipping rates, OTP rules | none | **write** | الكتالوج → الكوبونات; الإعدادات |
| Customers, addresses, admin roles | none | **write** | العملاء |
| Audit log | none | read | اليوم → recent; profile/order timelines |

Two changes to today's partner behaviour follow from the matrix, **both approved by the user 2026-09-13**: **(a)** confirm/ship SLA hours are admin-set per partner with a network default; the partner sees them and cannot change them (the partner settings PATCH drops both fields; the partner settings page shows them read-only with "يحددها المصنع"); **(b)** intake receipts can be recorded by **either** side — the partner as today, or the admin on the partner's behalf at hand-over — with `StockReceipt.recordedByUserId` and a `recordedBy: PARTNER | ADMIN` marker so the receipts list and the money report say who entered it. Everything else keeps its current owner.
