# Public — Profile Orders (order history)

Route(s): `app/(public)/profile/orders/page.tsx` (wrapped by `app/(public)/profile/layout.tsx`)
Key files: `app/api/profile/orders/route.ts`, `lib/constants/order-status.ts` (`getOrderStatusLabel`), `lib/format-en-numbers.ts` (`formatDateEn`), `components/shared/price.tsx`, Prisma models `Order`/`OrderItem`

## Business requirements
- **Goal/KPI**: post-purchase trust/retention — lets customers self-serve order status and history, reducing "where is my order" support inquiries. The empty-state CTA ("تسوق الآن" → `/categories`) is a light repeat-purchase nudge.
- **Trust/credibility**: a colored status pill + Arabic status label per order communicates delivery-progress transparency; totals are shown in EGP via the shared `Price` component.
- **Friction points (significant for a rebuild to weigh)**:
  - **No order-detail page/link exists** — this list is the entire order-history experience. Clicking an order row does nothing; there is no way to see the full shipping address, the full item list beyond 3, payment status, or shipment tracking from this screen.
  - **No filtering or search** by status or date.
  - **No pagination** — the API's `findMany` has no `take`/`skip`, so the full unbounded order history loads every time.
  - **No reorder action, no cancel action, no tracking link, no invoice/download.**
  - Item list is hard-truncated to the first 3 items with a "+N صنف آخر" note and no way to expand.
- **Compliance/consistency**: displayed totals use `Math.round(piastres / 100)` (rounds to nearest whole EGP) — the rebuild must preserve this exact rounding so totals don't visibly disagree with checkout/admin views of the same order.

## Elements & behavior
- [ ] On mount: `GET /api/profile/orders`; a `401` hard-redirects (`window.location.href`) to `/login?redirect=/profile/orders`. Orders are returned newest-first (`orderBy: createdAt desc`), each including its line items.
- [ ] Each order renders as an `<li>` card with two zones:
  - **Header row**: order id displayed as `#` + the **last 8 characters of the order's cuid, uppercased** (`order.id.slice(-8).toUpperCase()`) — not a real sequential/human order number, just a truncated internal id. Status pill colored via a **screen-local** `statusColors` map, label text from `getOrderStatusLabel`. Right side: formatted date (`formatDateEn`, `ar-EG` locale forced to Latin digits) and the order total via `<Price>`.
  - **Body**: up to 3 items rendered as `"{productName} — {variantName} × {quantity}"` with each item's EGP total; a "+N صنف آخر" note if there are more than 3; a payment-method line — `COD` → "الدفع عند الاستلام", `INSTAPAY_PREPAID` → "الدفع عبر InstaPay", anything else (e.g. `PAYMOB`) → generic "بطاقة".
- [ ] Empty-state CTA links to `/categories` (general catalog browse), not a targeted promo or the customer's last-viewed category.

## States
- [ ] Empty state — `orders.length === 0`: centered card, "لا توجد طلبات حتى الآن." text, "تسوق الآن" button → `/categories`.
- [ ] Loading state — `<h1>طلباتي</h1>` + "جاري التحميل…" only; no skeleton cards.
- [ ] Error state — **no explicit error handling**: the fetch chain has no `.catch()`. A network failure or a malformed/successless response simply leaves `orders` as `[]`, rendering the exact same UI as "genuinely has no orders" — a customer cannot distinguish a real backend failure from having no order history.
- [ ] Permission-restricted state — `401` triggers the same hard-redirect (`window.location.href`) pattern as addresses/account.

## Edge cases
- [ ] Order status `READY_TO_SHIP` (present in `ORDER_STATUS_LABELS`/`ORDER_STATUSES`) is **missing from this screen's local `statusColors` map** — such an order still gets the correct Arabic label but falls back to the generic muted/gray pill color instead of a distinct one.
- [ ] Order with more than 3 items — only the first 3 are shown; there is no way on this screen to see the rest.
- [ ] Order id shown to the customer is only the last 8 chars of a `cuid`, not a dedicated sequential order number — this file's research found no separate human-friendly order-number field in the schema.
- [ ] `reservationExpiresAt` is fetched by the API but never rendered here — consistent with the schema's own comment marking it "legacy; unused (admin decides, no auto-expiry)."
- [ ] The API returns `subtotalPiastres`, `discountPiastres`, `shippingPiastres`, `codFeePiastres` alongside `totalPiastres`, but the client's `Order` type and rendering only ever use `totalPiastres` — a customer cannot see a price breakdown (including any senior discount or coupon savings applied at purchase time) from order history, only the final total.

## Notes
- This is a strictly read-only screen — zero mutation actions exist (no cancel, reorder, invoice, tracking, or "contact support about this order"). Adding any of these in the redesign is new scope, not parity.
- Numerals and dates must stay in **English/Latin digits** even within Arabic text — enforced by `formatDateEn`'s `"ar-EG-u-nu-latn"` locale and `.toLocaleString("en-US")` — this is a site-wide convention (see header comment in `lib/format-en-numbers.ts`), not specific to this screen, and must be preserved.
