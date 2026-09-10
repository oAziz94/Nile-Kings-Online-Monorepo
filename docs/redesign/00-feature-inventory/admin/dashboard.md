# Admin — Dashboard / Home

Route(s): `app/(admin)/admin/page.tsx` (client component, `"use client"`)
Key files: `components/dashboard/kpi-card.tsx`, `components/dashboard/page-header.tsx`, `components/admin/admin-shell.tsx` (layout/nav shell), `app/(admin)/layout.tsx` (auth gate), `app/api/admin/analytics/route.ts`, `lib/analytics/queries.ts` (`getKpis`), `lib/catalog.ts` (`piastresToEgp`), `lib/format-en-numbers.ts` (`formatNumberEn`)

## Business requirements
- **Goal/KPI**: single-glance operational snapshot for the admin on login — revenue, net merchandise, and delivered-order count — plus fast entry points into the two highest-frequency daily tasks (reviewing orders, creating a manual order) and the two catalog-adjacent tasks admins reach for often (new product, partner inventory). Serves ops-efficiency (fewer clicks to the next task) rather than conversion/SEO (this is an internal tool, not indexed, RTL Arabic-only).
- **Trust/credibility signals**: none customer-facing — this is an internal back-office screen. The only "trust" concern is that the KPI numbers must be unambiguous to the admin: the dashboard explicitly labels revenue as "محصل من طلبات مُسلَّمة" (collected from delivered orders) and net merchandise as "بدون شحن ورسوم COD" (excluding shipping and COD fees) so finance-literate admins don't conflate gross order value with realized revenue.
- **Friction points**: the KPI fetch has no date-range picker on this screen — it always requests `from=1970-01-01` (i.e., all-time since epoch), so returning admins get a lifetime total every time, not "today" or "this week" figures, which is a plausible source of confusion vs. the fuller `/admin/analytics` page (which does support ranges). There's also no visible error state if the KPI fetch fails (see States/Edge cases) — the admin just sees dashes forever with no indication of a broken data pipe.
- **Compliance/legal**: none specific to this screen (no PII displayed).
- **Modern-look rationale**: KPI cards + quick-link tiles is standard admin-dashboard convention; no other business-driven layout constraint here.

## Elements & behavior
- [ ] `PageHeader` — title "لوحة التحكم", description "ملخص سريع للطلبات المُسلَّمة وإجراءات الإدارة اليومية.", a static `StatusBadge` reading "تم التسليم" (decorative, not interactive/filterable), and an action button "التقارير التفصيلية" linking to `/admin/analytics`.
- [ ] KPI grid (3 columns on `md+`, stacked on mobile) — three `KpiCard`s:
  - "إجمالي الإيراد" (total revenue) — `piastresToEgp(kpis.totalRevenuePiastres)` formatted via `formatNumberEn`, suffixed "ج.م"; hint "محصل من طلبات مُسلَّمة"; burgundy accent; `TrendingUp` icon.
  - "صافي المنتجات" (net merchandise) — `piastresToEgp(kpis.netMerchandisePiastres)`; hint "بدون شحن ورسوم COD"; gold accent; `Banknote` icon.
  - "طلبات مُسلَّمة" (delivered order count) — `kpis.orderCount` formatted via `formatNumberEn`, no hint; emerald accent; `ShoppingBag` icon.
- [ ] Quick actions panel — card titled "إجراءات سريعة" containing a 2×2 (mobile: 1-col, then 2-col, then 4-col at `lg`) grid of link tiles, each with an icon + label:
  - "مراجعة الطلبات" → `/admin/orders`
  - "طلب جديد" → `/admin/orders/new`
  - "منتج جديد" → `/admin/products/new`
  - "مخزون الشركاء" → `/admin/partner-inventory`
- [ ] Data fetch — on mount, `fetch("/api/admin/analytics?section=kpis&from=1970-01-01")` with `credentials: "include"`; sets `kpis` state from `json.data` only if `json.success` is truthy; always clears `loading` in `finally`.
- [ ] `/api/admin/analytics` (GET, `section=kpis`) — calls `requireAdmin()` (401/403 mapped to Arabic `apiUnauthorized`/`apiForbidden` responses); computes `getKpis(from, to)` which aggregates `Order` rows with `status: DELIVERED` (via `REPORT_ORDER_STATUS`) and `createdAt` in range: `totalRevenuePiastres` = `SUM(totalPiastres)`, `orderCount` = row count, `netMerchandisePiastres` = `SUM(subtotalPiastres - discountPiastres - seniorFreeValuePiastres)` computed in app code over the fetched rows (not a DB aggregate). Results are cached server-side (`getCached`/`setCached`, keyed by `from/to/granularity`) whenever no explicit `from`/`to` query param is passed and `cache!=no`; since the dashboard always passes `from=1970-01-01` explicitly, **the dashboard's request never hits this cache** (`useCache` requires *no* `from`/`to`).
- [ ] Layout auth gate (`app/(admin)/layout.tsx`, applies to all `/admin/*` routes) — server component: redirects unauthenticated users to `/login?redirect=<pathname>`; redirects authenticated non-admins to `/`. Role check is `User.role === "ADMIN"` only (see Notes — no separate "superadmin" tier exists anywhere in the codebase).
- [ ] `AdminShell` (persistent chrome around every admin page) — left-docked (RTL: right-docked visually via `dir="rtl"`) sidebar nav grouped into 5 sections (الرئيسية / العمليات / الكتالوج / الأشخاص / الإدارة) covering all `/admin/*` routes including ones not in this inventory batch (rerouting-rules, coupons, clients, admins, analytics, settings); mobile: hamburger opens a slide-in drawer (Escape key and backdrop click close it, body scroll locked while open); identity block fetches `/api/auth/me` client-side and displays name/phone/role, falling back to "Admin" if unset; logout button POSTs `/api/auth/logout` then hard-navigates to `/login`.

## States
- [ ] Empty state — not applicable (no list/table on this screen); KPIs at zero would simply render "٠ ج.م" / "٠" once loaded (no dedicated empty-state message).
- [ ] Loading state — each `KpiCard` shows a `Skeleton` (animated placeholder bar) in place of the value while `loading` is true; quick-links and header render immediately (not gated on the fetch).
- [ ] Error state — **no explicit error UI**. If the fetch throws or `res.json()` fails, the `.catch(() => setKpis(null))` swallows it silently; if it resolves but `json.success` is falsy, `kpis` is simply never set. Either way `loading` still flips to `false` in `finally`, and all three KPI values permanently render the literal em dash `"—"` with no retry affordance or toast.
- [ ] Permission-restricted state — enforced one level up at `app/(admin)/layout.tsx`, not on this page itself: non-admins redirected to `/`, unauthenticated users redirected to `/login?redirect=/admin`.

## Edge cases
- [ ] `requireAdmin()` throws with `status` other than 401/403 in the API route — re-thrown (`throw e`), which becomes an unhandled 500 from the route handler; client-side this is indistinguishable from any other fetch failure (dash forever, see above).
- [ ] Slow network / analytics query timeout — no client-side timeout or abort controller; the skeleton persists indefinitely until the fetch settles.
- [ ] `kpis.totalRevenuePiastres` is `0` (no delivered orders ever) — renders "٠ ج.م", not visually distinguished from a failed/unset fetch beyond the presence of a real (not dash) value.
- [ ] Admin identity fetch (`/api/auth/me`) fails or is slow — sidebar falls back to showing phone or role, or the literal string "Admin"; does not block page render.

## Notes
- There is no superadmin/admin role split anywhere in the auth layer (`lib/auth/session.ts`'s `resolveAdminUser`/`userHasAdminAccess`/`requireAdmin` all check only `User.role === "ADMIN"`). Every admin-area permission boundary found across the 7 screens in this inventory batch is binary: ADMIN role vs. not. Flag this for the PM/implementer — do not invent a superadmin tier in the rebuild.
- The dashboard's KPI figures are **lifetime-to-date, delivered-orders-only** — they are not "today," "this week," or "all orders regardless of status." A redesign that adds a date-range selector here would be a scope change, not pure parity; if desired, it should be proposed via `02-proposals.md`, not assumed.
- The "تم التسليم" badge next to the page title is purely decorative/labeling (echoes that the KPIs reflect delivered orders) and is not clickable/filterable.
- Sidebar nav in `AdminShell` is the single source of truth for what counts as an `/admin` surface; it already includes routes outside this inventory batch (rerouting-rules, coupons, clients, admins, analytics, settings) — useful cross-reference for the other agent covering those screens.
