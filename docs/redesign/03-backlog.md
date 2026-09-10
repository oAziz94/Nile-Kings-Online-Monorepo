# Redesign — phases & backlog

Phases run roughly in order; tasks within a phase can run in parallel once the phase's prerequisites (previous phase's decisions) are settled.

## Phase 0 — Feature inventory
Per-screen feature-parity checklists under `00-feature-inventory/`, covering all four surfaces. This is the grading rubric every later task is checked against. **Complete** (2026-09-10) — 39 files across all 4 surfaces; findings triaged and every fix/remove/add decision recorded in `02-proposals.md`/`04-decisions.md`.

## Phase 1 — Design system
Claude Design canvas: tokens, core components, four representative screens (see `01-design-system.md`). **Complete** — pharaonic-palette canvas (8 artboards) built, corrected twice against review findings, approved by user 2026-09-10. Canvas: https://claude.ai/code/artifact/c53479c8-aac0-4f52-a73b-824448b96ab7, sources at `design-canvas/*.dc.html`.

## Phase 2 — Infra baseline
Instrument current Vercel/Neon/Upstash/Cloudinary usage before any provider decisions. Produces the data behind any later infra swap. Not started. Concrete tasks:
- **2.1** — Vercel: current plan tier, build-minutes/mo, function invocations/mo, bandwidth/mo (from the Vercel dashboard's usage tab).
- **2.2** — Neon: storage size, compute hours/mo, active branch count (main + `redesign`), connection-pool utilization.
- **2.3** — Upstash Redis: commands/mo against the 500K free-tier ceiling (per `04-decisions.md` 2026-09-09, expected well under it, but confirm with real numbers, not the estimate).
- **2.4** — Cloudinary: storage, bandwidth, transformations/mo against free-tier limits.
- Output: a short `02-infra-baseline.md` with current numbers, so Phase 6's "did this help" comparison has a real baseline, not a guess.

## Phase 3 — Foundation build
Shared infrastructure every Phase 4 screen task depends on. Not started. Concrete tasks:
- **3.1** — Port the design canvas's tokens into `tailwind.config.ts`/`app/globals.css`, replacing the old burgundy/gold CSS variables with the pharaonic set (papyrus/stone/lapis/gold/carnelian/turquoise/malachite — exact HSL values in `design-canvas/Main.dc.html`'s `:root`). Copy the recolored logo assets (`design-canvas/logo-assets/*.png`) into `public/brand/` for real app use.
- **3.2** — Expand `components/ui` primitives per `04-decisions.md`'s "Component base" call: add dropdown-menu, tabs, popover, tooltip, checkbox, radio-group, switch, form (Radix + CVA, matching the existing shadcn/ui pattern).
- **3.3** — Wire `react-hook-form` + `@hookform/resolvers/zod` as the standard form pattern, reusing the existing server-side Zod schemas; ship one reference implementation (e.g. the login form) other tasks copy from.
- **3.4** — TanStack Query + TanStack Table scaffolding for admin/partner data-grid screens.
- **3.5** — Add Sentry (free Developer tier, per `04-decisions.md` 2026-09-09).
- **3.6** — Set up Playwright + the per-screen smoke-test pattern `ui-verifier` will add to going forward.
- **3.7** — Confirm Prisma's `DIRECT_URL` uses Neon's unpooled endpoint, not the pooled one (flagged as a pre-existing misconfiguration in `04-decisions.md` 2026-09-09 — fix while touching connection config regardless of the redesign).

**Precondition, already satisfied**: the `redesign` Neon database branch exists and is verified working (`.env.redesign`, confirmed 2026-09-09).

## Phase 4 — Surface rebuilds
Order: **Auth → Public storefront → Partner portal → Admin dashboard**. Each screen is its own task branch (`redesign/<surface>/<screen-slug>`): `ui-implementer` builds against its Phase-0 checklist + approved changes below + the Phase-1 design, `ui-verifier` checks it (extra scrutiny on checkout/payment per `04-decisions.md`), PM closes or bounces it, `npm run version:task` on merge. Depends on Phase 3. Not started.

### Auth (first surface — smallest, proves the loop)
- **4.1 — Login** (`00-feature-inventory/auth/login.md`). Parity + approved changes: fix the register/login open-redirect inconsistency by giving both the same `safeRedirect` guard; add password login rate limiting; account phone now validates against all 22 dropdown countries via `libphonenumber-js` instead of Egypt-only (`04-decisions.md` 2026-09-10 "International account phone numbers").
- **4.2 — Register** (`.../auth/register.md`). Parity + approved changes: same redirect-guard/rate-limiting/international-phone changes as login; **remove** the dead OTP-for-registration code path (`app/api/auth/otp/*`, `lib/auth/otp.ts`'s registration flow) entirely rather than wiring it up; add a redirect-away-if-already-logged-in guard (matching login); add a `/terms`/`/privacy` link near the submit button.
- **4.3 — Forgot password** (`.../auth/forgot-password.md`). Parity, mostly unchanged (this is the one screen that keeps OTP) + approved changes: account phone international-number support here too (the OTP-request lookup is by account phone); add the same already-logged-in redirect guard for consistency.

### Public storefront, Partner portal, Admin dashboard
Not detailed yet — concrete tasks get added here once Auth is verified and each surface's turn comes up, so they can be written against Auth's actual implementation patterns (shared form/validation approach, component usage) rather than guessed in advance. The approved changes queued for each surface are already fully recorded in `02-proposals.md` and `04-decisions.md`'s 2026-09-10 entries; nothing is at risk of being lost in the meantime.

## Phase 5 — New features
Approved items from `02-proposals.md`, layered in per-surface once that surface's parity rebuild (Phase 4) is verified. Not started.

## Phase 6 — Performance & cost pass
Apply `02-proposals.md` performance items (ISR, Redis caching, image pipeline, server-components audit) using the Phase 2 baseline to confirm improvement. Decide on any infra swap here, with data. Not started.
