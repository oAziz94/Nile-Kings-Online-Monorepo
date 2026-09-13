# Admin dashboard v2 — the operations console

Status: **draft for user approval, 2026-09-13.** User direction: "you should propose and redesign the dashboard logically, not just as a style. Make the admin's life easier, control the things we already need in the partner dashboard, and remove anything that has no necessity."

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

Result: **8 nav items** instead of 14, and every remaining item answers one of the four questions.

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
- **List**: every agent and distributor with health at a glance — open orders, overdue %, days of stock cover, balance owed to the factory, active/inactive. Search, filter by type/governorate/health. Applications ("طلبات الشراكة") are a tab here, not a separate concept.
- **Partner profile** (`/admin/partners/[id]`), tabs:
  - **الملف**: identity, contact, socials, linked agent, active toggle (8.2's form, moved here).
  - **الأداء**: this partner's own reports (sales, fulfilment, inventory) — the same pages the partner sees, read by the admin.
  - **الطلبات**: the pipeline filtered to this partner.
  - **المخزون**: the editable grid from today's مخزون الشركاء, per partner, ledger-backed.
  - **الحساب المالي**: cost rate, receipts (what they took from the factory at what rate), payments recorded, running balance, next `dueAt`. Record a payment here (5.1's panel, moved).
  - **الإعدادات**: every knob partner v2 introduced, admin-controlled in one place — `confirmSlaHours`, `shipSlaHours`, `workingDays`, `dailyOrderCapacity`, `lowStockThreshold`, `deadStockDays`, `targetCoverDays`, `costRateBps`. Today these are scattered or partner-editable; the admin gets them all with the partner's current values and the network default beside each.
- **التوجيه** (tab or sub-page): the governorate matrix described in §2.
- **مخزون الشبكة**: the cross-partner low-stock view.

### 3.5 الكتالوج
- المنتجات (list, detail with variants, images per colour → gallery), الفئات, الكوبونات (with 8.1's validity window). Bulk edit on products (Phase 5 approved). Restyle only, no IA change.

### 3.6 التقارير
- The partner v2 report platform (period + comparison + headline + series + breakdowns + CSV) run for the whole network, with **partner** as a first-class breakdown: المبيعات (by partner, governorate, category, product), التجهيز (on-time, overdue, cancellation reasons by partner), المخزون (network cover, dead stock, out-of-stock by partner, the daily snapshot comparison from 7.5), المال (what each partner owes, payments received, receipts issued).
- v1 analytics, its CSV routes and `lib/cache/analytics.ts` are deleted once parity is verified.

### 3.7 الإعدادات
- **المتجر**: COD fee, senior-citizen promo toggle (finally rendered), shipping rates when the admin-editable calculator lands (Phase 5, seeded with today's constants).
- **الشركاء**: network defaults for every knob in §3.4 (new partners inherit them).
- **الأمان**: OTP rules.
- One save per group, a confirm dialog on anything that changes a customer's price, and the change written to the audit log with the old and new values.

### 3.8 العملاء
- List and detail as today, restyled; a **المسؤولون** tab with grant/revoke (8.3).

## 4. Shell
- Same shell component as partner v2 (light SaaS rail, collapsible from 7.1, topbar slot, mobile top bar + sheet drawer). Admin gets its own nav config and a queue badge on اليوم.
- Nav, in order: اليوم · الطلبات · أسئلة العملاء · الشركاء · الكتالوج (المنتجات، الفئات، الكوبونات) · العملاء · التقارير · الإعدادات.

## 5. What is removed
- `/admin/analytics` page, its two API routes, `lib/cache/analytics.ts`.
- `/admin/routed-orders` list and detail (powers move into the order detail); `/admin/rerouting-rules` list/new/detail (replaced by the matrix); `/admin/partner-inventory` (moved into the hub); `/admin/admins` (a tab).
- The dashboard's "التقارير" button and its quick-link tiles.
- Nothing under `app/api/**` that a remaining screen or the storefront still calls is touched; removal is verified by grep before delete.

## 6. Standing rules
The partner v2 rules (1)–(10) and A7–A8 apply, plus: (B1) every admin write that changes money, stock, status or a setting appends an audit row with actor, before and after; (B2) the shell, `DataTable`, report platform and status pills are shared with partner v2 — no admin-only variants; (B3) an admin screen never re-implements a partner computation — it calls the same `lib/**` function with a wider scope; (B4) removing a screen requires a redirect from its old URL to its new home.

## 7. Process and order
1. **Canvas round** (this week): artboards for اليوم, الطلبات + detail with reassign/proof, the partner hub list + profile (الحساب المالي and الإعدادات tabs), the routing matrix, network stock, one report page, settings. Published for approval like the partner v2 and account canvases; no task starts before approval.
2. Tasks after approval, numbered 9.x: 9.1 shell + nav + redirects + audit-log foundation; 9.2 اليوم; 9.3 orders pipeline + detail (absorbs routed-orders); 9.4 partner hub list + profile tabs (absorbs partner-inventory, admins-into-clients); 9.5 routing matrix + network stock; 9.6 reports network-wide (deletes v1 analytics); 9.7 settings; 9.8 catalog restyle + bulk actions + gallery; 9.9 full suite + version.
3. Each task through implementer → verifier → PM fixes → merge, as before.
