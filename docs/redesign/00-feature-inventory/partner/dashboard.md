# Partner — Dashboard / Home

Route(s): `app/(partner)/partner/page.tsx` (server component, no `"use client"`), gated by `app/(partner)/partner/layout.tsx`
Key files: `components/partner/partner-shell.tsx` (persistent chrome/nav), `lib/auth/session.ts` (`getCurrentUser`, `requirePartner`), `app/api/partner/me/route.ts`

## Business requirements
- **Goal/KPI**: there is no dashboard content to serve a goal — see Notes. The *layout* (`PartnerShell`) that wraps every `/partner/*` page is what actually establishes trust/orientation for the partner (their name, phone, and partner-type label, plus role-appropriate navigation), so from a business standpoint the "home" experience is really "land straight on the most actionable screen" (product/stock table) rather than a summary dashboard.
- **Trust/credibility signals**: none on this specific route (it renders nothing itself). The shell around it does show the authenticated identity ("`{name}` / Nile Kings `{Agent|Distributor}`") so a partner always knows which account/role they're operating as — relevant since a phone number can only be tied to one `Partner` row but the UI has two materially different partner types (see Notes).
- **Friction points**: a brand-new partner logging in for the first time gets no orientation/summary — they land directly on a dense stock-editing table (`/partner/products`) with zero context (no KPIs, no "what's pending," no onboarding). This is a plausible source of confusion/support load for new partners, especially distributors who have a much smaller nav (3 items) than agents (5 items).
- **Compliance/legal**: none specific (no PII rendered on this route).
- **Modern-look rationale**: n/a — this route has no visual design of its own to preserve; the redesign should decide whether `/partner` should become a real dashboard (KPIs, pending routed-orders count, low-stock alert, etc. — mirroring `admin/dashboard.md`'s "landing snapshot" pattern) or continue to redirect. `[NEEDS PM INPUT: should the redesign introduce an actual partner dashboard, or preserve the redirect-to-products behavior?]`

## Elements & behavior
- [ ] `app/(partner)/partner/page.tsx` — the **entire** implementation is:
  ```tsx
  export default function PartnerPage() {
    redirect("/partner/products");
  }
  ```
  There is no dashboard UI, no data fetch, no KPIs, no quick links. Visiting `/partner` (or `/partner/`) always immediately 307-redirects to `/partner/products` for every authenticated partner, regardless of `partnerType` (AGENT or DISTRIBUTOR both land on the same products/stock screen).
- [ ] `app/(partner)/partner/layout.tsx` (applies to this route and every other `/partner/*` route) — server component auth gate, evaluated *before* the page's own redirect:
  - Calls `getCurrentUser()`; if no session user, reads `x-pathname` request header (falls back to `/partner`) and redirects to `/login?redirect=<pathname>`.
  - Calls `requirePartner()` in a `try/catch`; any thrown error (401 not-logged-in already handled above; 403 = authenticated user has no active `Partner` row) redirects to `/` (the storefront home), **not** to an "unauthorized" page or back to login.
  - On success, wraps `children` in `<PartnerShell>`.
- [ ] `PartnerShell` (`components/partner/partner-shell.tsx`) — persistent chrome for every partner page:
  - Fetches `/api/partner/me` client-side on mount to resolve `partnerType` (`"AGENT" | "DISTRIBUTOR"`) and identity (`name`, `phone`). Silently no-ops on fetch failure (`.catch(() => undefined)`) — nav then falls back to the AGENT item set (see below) with a blank identity block.
  - Desktop: fixed right-docked (RTL) 14rem sidebar with logo/brand block, identity card (name + phone/type), and nav links. Mobile (`<lg`): sticky top header with hamburger button opening a slide-in drawer (`role="dialog"`, `aria-modal`, closes on Escape key, backdrop click, or route change; locks `document.body` scroll while open).
  - Nav items differ by `partnerType`:
    - **AGENT**: مخزون المنتجات (`/partner/products`), الطلبات (`/partner/routed-orders`), الموزعون (`/partner/distributors`), طلبات الموزعين (`/partner/distributor-requests`), التقارير (`/partner/reports`).
    - **DISTRIBUTOR**: مخزون المنتجات (`/partner/products`), الطلبات (`/partner/routed-orders`), طلب إعادة توريد (`/partner/restock-requests`).
    - Both: static "الحساب" section with a "المتجر" link back to `/` and a "تسجيل الخروج" (logout) button that POSTs `/api/auth/logout` then hard-navigates (`window.location.href`) to `/login`.
  - Active-link highlighting: exact match or `pathname.startsWith(href + "/")`.
  - Before `partnerType` resolves (first render / fetch in flight / fetch failed), `partnerType` is `null` and the nav renders the **AGENT** item set by default (the ternary `partnerType === "DISTRIBUTOR" ? DISTRIBUTOR_NAV_ITEMS : AGENT_NAV_ITEMS"` treats `null` the same as `"AGENT"`) — a distributor will briefly (or permanently, on fetch failure) see agent-only nav items they cannot actually use (see Edge cases).

## States
- [ ] Empty state — n/a, no list/content on this route.
- [ ] Loading state — none visible on `/partner` itself (redirect happens server-side before any client paint); the *destination* page (`/partner/products`) has its own loading state (see `products.md`). The shell's identity block shows a generic "Partner" placeholder name and no phone until `/api/partner/me` resolves.
- [ ] Error state — none on this route (no fetch, no rendering). If `requirePartner()` throws for a reason other than "no partner row" (e.g. DB error), it propagates as an unhandled exception in the layout — Next.js error boundary behavior applies (not partner-specific).
- [ ] Permission-restricted state — unauthenticated → `/login?redirect=/partner`; authenticated but no active `Partner` row (or `Partner.isActive === false`) → silently redirected to `/` with no message explaining why (see Edge cases).

## Edge cases
- [ ] User has a `Partner` row but `isActive: false` — `requirePartner()` throws 403 (its `where` clause requires `isActive: true`), so the layout redirects to `/` with **no explanation shown to the user** (no toast, no "your account is disabled" message anywhere in this flow).
- [ ] `PartnerShell`'s `/api/partner/me` fetch fails or the user's `partnerType` is neither `"AGENT"` nor `"DISTRIBUTOR"` (defensive check: `type === "AGENT" || type === "DISTRIBUTOR"`) — `partnerType` state stays `null` forever, nav silently defaults to the AGENT item set for a distributor account. A distributor could then click "الموزعون" (agents-only, not in their real nav but would render if `partnerType` were misresolved) and hit a 403 from the underlying API.
- [ ] Direct navigation to `/partner` while already on a partner page — always redirects to `/partner/products`, discarding whatever page/filters the partner was on (no "return to last visited partner page" behavior).
- [ ] A user with **two** roles in theory (e.g. also an admin) — `requirePartner()` only checks for an active `Partner` row tied to `userId` or `phone`; it does not consult `User.role`, so an admin who also happens to have a partner record would still be routed through the partner shell here, not the admin one. `[NEEDS PM INPUT: is a dual admin+partner account an expected real-world case, or purely theoretical?]`

## Notes
- **This screen does not exist as a dashboard today.** `app/(partner)/partner/page.tsx` is a one-line redirect to `/partner/products`. Unlike `admin/dashboard.md` (which documents a real KPI dashboard at `/admin`), there is no partner-facing analog — no KPI cards, no quick actions, nothing to preserve pixel-for-pixel. The redesign's "parity" target for this route is simply: *authenticated partner visiting `/partner` lands on the products/stock screen*. Anything beyond that (an actual dashboard) is a net-new feature, not a rebuild, and should go through `02-proposals.md` per the PM role brief rather than being assumed here.
- The two partner types (`AGENT`, `DISTRIBUTOR`) get materially different nav and materially different permissions on nearly every downstream screen (see `orders.md`, `routed-orders.md`, `products.md`, `restock-requests.md`, `distributors.md`, `distributor-requests.md`, `reports.md`). There is no third "home" concept differentiating them — both types redirect to the identical `/partner/products` URL.
- `requirePartner()` (`lib/auth/session.ts`) resolves a `Partner` row by `userId` **or** `phone` match — the auth model does not otherwise distinguish "which partner type is this session" until a downstream page/API queries `Partner.partnerType` itself. There is no single shared "current partner" React context; `partnerType` is independently re-fetched via `/api/partner/me` on essentially every partner page/component that needs it (the shell, the orders list, etc.) — worth consolidating in the rebuild but is current, real behavior (repeated fetches), not a hypothetical.
