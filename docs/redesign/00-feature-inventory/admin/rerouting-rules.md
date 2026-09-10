# Admin — Rerouting Rules (governorate → partner auto-assignment)

Route(s): `app/(admin)/admin/rerouting-rules/page.tsx` (list), `app/(admin)/admin/rerouting-rules/new/page.tsx` (create), `app/(admin)/admin/rerouting-rules/[id]/page.tsx` (detail/edit) — all client components. Covered together in this one file: the list is a thin table, "new" only captures one field, and the real complexity (partner roster management) lives entirely on the detail page.
Key files: `app/api/admin/rerouting-rules/route.ts` (GET list, POST create), `app/api/admin/rerouting-rules/[id]/route.ts` (GET one, PATCH isActive, DELETE), `app/api/admin/rerouting-rules/[id]/partners/route.ts` (GET/POST linked partners), `app/api/admin/rerouting-rules/[id]/partners/[linkId]/route.ts` (PATCH/DELETE one link), `lib/rerouting/assign.ts` (`assignOrderToGovernorate` — the actual round-robin consumer, runs at order-creation time, not in this UI), `lib/services/shipping.ts` (`GOVERNORATE_OPTIONS`), `prisma/schema.prisma` (`ReroutingRule`, `ReroutingRulePartner`, `RoutedOrder`, `RoutedOrderStatus`, `AssignmentMode`).

## Business requirements
- **Goal/KPI**: pure ops-efficiency tool. It lets admins auto-distribute new orders across regional fulfillment partners (agents/distributors) by the customer's governorate, using round-robin, so no human has to manually pick a partner for every order. This directly affects delivery-time consistency (a governorate with an inactive/empty rule falls back to `UNROUTED`, which is an operational fire that needs a human to notice and fix).
- **Trust/credibility signals**: none customer-facing — this is a pure back-office screen with no storefront-visible effect beyond indirectly affecting delivery speed.
- **Friction points**: (1) a governorate can only ever have one rule (`governorate` is `@unique` on `ReroutingRule`) — the "new rule" form doesn't warn about this beyond a generic "duplicate" error thrown by the API if the admin re-picks an already-configured governorate, since the dropdown doesn't gray out or hide already-used governorates. (2) There is no bulk-partner-add — partners are added one at a time via a modal, which is slow if seeding many partners into many governorates. (3) No indication anywhere in this UI of *order volume* per rule/partner, so admins can't tell if round-robin distribution is actually balanced in practice — they'd have to cross-reference `/admin/routed-orders`.
- **Compliance/legal**: none specific.
- **Modern-look rationale**: none beyond standard admin table/detail conventions — this is a low-traffic internal configuration screen, not a place where "modern" carries business weight.

## Elements & behavior

### List (`/admin/rerouting-rules`)
- [ ] `PageHeader` — title "قواعد التوجيه", description "تعيين الطلبات للشركاء حسب المحافظة (round-robin).", action button "قاعدة جديدة" → `/admin/rerouting-rules/new`.
- [ ] Table (one row per `ReroutingRule`, `orderBy: governorate asc`) with columns: المحافظة (governorate), عدد الشركاء (`_count.partners` — **total linked partners, not filtered to active-only**), الحالة (`Badge`: "مفعّل"/default variant if `isActive`, else "معطّل"/secondary), آخر شريك مُعيَّن (last-assigned partner's name + `"(وكيل"` or `"(موزع)"` translated from `partnerType`, or "—" if none yet), إجراءات ("تفاصيل / تعديل" link → `/admin/rerouting-rules/[id]`).
- [ ] No search/filter/pagination on this list — it's a flat, unpaginated table (reasonable given governorate count is capped at ~27).
- [ ] No delete action anywhere in this list's UI, despite `DELETE /api/admin/rerouting-rules/[id]` existing (see Notes).

### New (`/admin/rerouting-rules/new`)
- [ ] Single-field form: a `Select` populated from `GOVERNORATE_OPTIONS` (27 Egyptian governorates, canonical Arabic labels) — required, client-side validated ("اختر المحافظة" toast if empty on submit) — plus an "الحالة" (active/inactive) `Select` defaulting to "مفعّل" (true).
- [ ] Submit → `POST /api/admin/rerouting-rules` with `{ governorate, isActive }`; on success, redirects straight to the new rule's detail page (`/admin/rerouting-rules/[id]`) so the admin can immediately add partners. On failure (e.g. duplicate governorate), shows the API's Arabic error message via toast and stays on the form.
- [ ] "إلغاء" (cancel) link back to the list.

### Detail (`/admin/rerouting-rules/[id]`)
- [ ] Header: "قاعدة التوجيه: {governorate}" + "← قواعد التوجيه" back link.
- [ ] Status card — badge showing current state + a `Select` (مفعّل/معطّل) that, on change, immediately fires `PATCH /api/admin/rerouting-rules/[id]` with `{ isActive }` (no confirm dialog, no explicit "save" button — changing the dropdown is the save action). Disabled while the request is in flight (`updating` state).
- [ ] Linked-partners card — title "الشركاء المرتبطين", description states round-robin distribution and shows "آخر شريك مُعيَّن: {name}" or "—". Contains:
  - "إضافة شريك" button — disabled when there are no more eligible partners to add (`availableOptions.length === 0`, i.e. every AGENT/DISTRIBUTOR partner in the system is already linked to this rule).
  - Table of linked partners (`ReroutingRulePartner`, `orderBy: priority asc, createdAt asc`): الاسم, الهاتف, النوع (وكيل/موزع), الحالة (badge), إجراءات (تفعيل/إيقاف toggle button + إزالة/remove button, both `variant="ghost"`, remove styled destructive-red text).
  - Toggling a partner's active state → `PATCH /api/admin/rerouting-rules/[id]/partners/[linkId]` `{ isActive }`, then full rule refetch. Does **not** delete the link — an inactive partner stays in the roster but is skipped by round-robin (`lib/rerouting/assign.ts` filters `where: isActive: true`).
  - "إزالة" (remove) → `DELETE /api/admin/rerouting-rules/[id]/partners/[linkId]`, no confirmation dialog, then refetch. This permanently unlinks the partner from the rule (not a soft toggle).
- [ ] "Add partner" dialog — a `Select` listing partner options not already linked (`partnerOptions` minus `linkedIds`), each formatted `"{name} – {phone} ({وكيل|موزع})"`. Partner options are loaded once on page mount via two parallel fetches: `GET /api/admin/partners?partnerType=AGENT&limit=100` and `...partnerType=DISTRIBUTOR&limit=100` (hard cap of 100 each — see Edge cases). Confirm → `POST /api/admin/rerouting-rules/[id]/partners` `{ partnerId }`, closes dialog, refetches rule, resets selection.

## States
- [ ] Empty state (list) — `EmptyState` component, icon + "لا توجد قواعد توجيه" / "أنشئ قاعدة لربط المحافظات بالشركاء." when zero rules exist.
- [ ] Empty state (detail, partner list) — plain text "لا يوجد شركاء. أضف شركاء لتفعيل التوجيه التلقائي." (not the shared `EmptyState` component, just a `<p>`).
- [ ] Loading state — list and detail both render a single full-width `Skeleton` block (`h-64`/`h-96`) while the initial fetch is in flight; no skeleton row-shimmer, just one placeholder covering the whole content area. New-rule form has no loading state (nothing to fetch before render).
- [ ] Error state — every fetch failure (network throw or non-success JSON) surfaces via `toast({ variant: "destructive" })` with either the API's Arabic message or a generic "خطأ في الاتصال" — no inline error banner, no retry button; the page is left showing stale/empty data.
- [ ] Permission-restricted state — enforced entirely at `app/(admin)/layout.tsx` (see `admin/dashboard.md` for full description): unauthenticated → redirect to `/login`; non-`ADMIN` role → redirect to `/`. Nothing rerouting-rules-specific.

## Edge cases
- [ ] Governorate already has a rule — `POST /api/admin/rerouting-rules` returns 400 "يوجد بالفعل قاعدة توجيه لهذه المحافظة"; the "new rule" `Select` does not filter out already-configured governorates, so this is discoverable only by trying.
- [ ] Deactivating the last active partner in a rule, or a rule itself — `assignOrderToGovernorate()` (order-time, not this screen) falls back to creating a `RoutedOrder` with `status: "UNROUTED"` and no `partnerId`; this UI gives no warning when an admin's toggle would leave a governorate with zero active partners/an inactive rule.
- [ ] More than 100 AGENT or 100 DISTRIBUTOR partners exist system-wide — the "add partner" dialog's option list is capped at 100 per type (`limit=100` in the fetch), so partners beyond that cap are silently unselectable from this dialog.
- [ ] Round-robin sequencing (`lib/rerouting/assign.ts`) is **not visualized anywhere in this UI** — `assignmentSequence`/`lastAssignedPartnerId` are internal bookkeeping; an admin cannot see "who's next" without inspecting `/admin/routed-orders` order history.
- [ ] `Order.assignedPartnerId` (set earlier at checkout, when the customer's cart is fulfilled from a specific partner's stock) takes priority over the rerouting rule entirely — see Notes. The rule/round-robin only decides assignment when no partner was pre-selected at checkout time.
- [ ] Rule/partner-link `DELETE` endpoints exist and are fully functional (`DELETE /api/admin/rerouting-rules/[id]`, tested via curl/API client) but have **no UI trigger anywhere** in list or detail pages — a rule, once created, can only be deactivated, never deleted, through this UI.

## Notes
- **This is not a rule-condition builder.** Despite the "rerouting rules" name suggesting something like order-value/weight/SKU conditions, the actual model is much simpler: one rule per governorate (an `@unique` constraint enforces this), holding an ordered/priority list of partners that receive orders via round-robin. There is no condition builder UI or backend — don't invent one for the rebuild; if a richer condition system is wanted, that's a scope change for `02-proposals.md`.
- **Round-robin mechanics** (from `lib/rerouting/assign.ts`, for context the redesign's implementer may need even though it's not rendered in this UI): on order creation, if the order already has an `assignedPartnerId` (the partner whose stock was reserved at checkout), the order routes straight to that partner — governorate rules are bypassed entirely for orders that already have a committed fulfilling partner. Only when there's no pre-assigned partner does the code look up the `ReroutingRule` for the delivery governorate, take its active partners ordered by `priority asc, createdAt asc`, and pick the partner *after* `lastAssignedPartnerId` in that list (wrapping around), then persist that as the new `lastAssignedPartnerId`. If no active rule or zero active partners, the order becomes `RoutedOrder.status = "UNROUTED"`.
- `_count.partners` shown in the list table counts **all** linked partners regardless of their individual `isActive` flag — it will not visibly drop when an admin deactivates (not removes) a partner from a rule, which could read as misleading roster size.
- The rerouting-rules nav item lives under the "العمليات" (Operations) sidebar group in `AdminShell`, alongside Orders and Routed Orders — logically it's understood as an operations/fulfillment-config tool, not a "catalog" or "people" config tool.
