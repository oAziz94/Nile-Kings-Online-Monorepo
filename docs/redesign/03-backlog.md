# Redesign — phases & backlog

Phases run roughly in order; tasks within a phase can run in parallel once the phase's prerequisites (previous phase's decisions) are settled.

## Phase 0 — Feature inventory
Per-screen feature-parity checklists under `00-feature-inventory/`, covering all four surfaces. This is the grading rubric every later task is checked against. **Complete** (2026-09-10) — 39 files across all 4 surfaces; findings triaged and every fix/remove/add decision recorded in `02-proposals.md`/`04-decisions.md`.

## Phase 1 — Design system
Claude Design canvas: tokens, core components, four representative screens (see `01-design-system.md`). **Complete** — pharaonic-palette canvas (8 artboards) built, corrected twice against review findings, approved by user 2026-09-10. Canvas: https://claude.ai/code/artifact/c53479c8-aac0-4f52-a73b-824448b96ab7, sources at `design-canvas/*.dc.html`.

## Phase 2 — Infra baseline
Instrument current Vercel/Neon/Upstash/Cloudinary usage before any provider decisions. Produces the data behind any later infra swap. **Complete** (2026-09-10) — see `02-infra-baseline.md` for full numbers and analysis.
- **2.1 — Vercel** — done (user provided dashboard screenshots). **This is the dominant cost by far, ~$40/period vs. Neon's ~$6.59 and Cloudinary/Upstash's ~$0.** Two biggest lines (Web Analytics Events $10.71, and Fluid Active CPU $16.81 alongside 8.26M function invocations) map directly onto two already-approved Phase 6 items (drop `@vercel/analytics`; server-components/redundant-fetch audit) — real evidence those items matter, not just code hygiene.
- **2.2 — Neon** — done: storage via SQL (111 MB both branches, no drift) + console billing (Launch plan — paid, not free as `04-decisions.md` 2026-09-09 assumed; $6.59/period). Correction logged in `02-infra-baseline.md`.
- **2.3 — Upstash Redis** — done: confirmed free tier, 1.2K/500K commands, effectively zero cost/risk.
- **2.4 — Cloudinary** — done: Free tier, 25.6% of monthly credits used, bandwidth (not storage/transformations) is 92% of that — validates the already-approved image-pipeline item.
- **Conclusion**: no provider swap looks warranted right now — execute the already-approved Phase 6 items (they target the two real cost drivers directly) and re-measure before considering any swap.

## Phase 3 — Foundation build
Shared infrastructure every Phase 4 screen task depends on. **Complete** (2026-09-10), except one item that needs the user's hand (3.7). Every code change below is verified via `tsc --noEmit`, a full `next build`, the Vitest suite (71 passing), and/or a live Playwright run against a real dev server — not just written and assumed to work.
- **3.1** ✅ — Pharaonic design tokens ported into `tailwind.config.ts`/`app/globals.css` (papyrus/stone/lapis/gold/carnelian/turquoise/malachite, matching `design-canvas/Main.dc.html`'s `:root` exactly). Old `--burgundy`/`--gold` kept as aliases repointed at the new palette (not deleted) so screens Phase 4 hasn't rebuilt yet render on-brand immediately. Recolored logo assets copied into `public/brand/` (not yet wired into any component — Phase 4 work).
- **3.2** ✅ — `components/ui` expanded: dropdown-menu, tabs, popover, tooltip, checkbox, radio-group, switch added (Radix-based, matching the existing pattern). Button reshaped to the design system's pill default (+ a new gold "accent" variant); Badge's success/warning now use the pharaonic tokens (+ a new "info" variant). Dialog rewritten on real `@radix-ui/react-dialog` — the old hand-rolled version was silently missing Escape-to-close and a real focus trap; same exported API, so no call site needed to change except two already-dead `onClose` no-ops.
- **3.3** ✅ — `react-hook-form` + `@hookform/resolvers/zod` wired via `components/ui/form.tsx` (the standard Form/FormField/FormItem/FormLabel/FormControl/FormDescription/FormMessage set, bridged to a real `@radix-ui/react-label` Label). Resolver integration verified with a wiring test, not just written. The actual login-form conversion happens when Phase 4's task 4.1 starts, not here.
- **3.4** ✅ — TanStack Query provider wired into both admin and partner layouts (one `QueryClient` per component tree, per TanStack's SSR guidance); TanStack Table installed, actual table usage is per-screen Phase 4 work.
- **3.5** ✅ — Sentry added (`instrumentation.ts` + `instrumentation-client.ts`, the current `@sentry/nextjs` v10 App Router convention; `next.config.ts` wrapped). Conservative sampling to fit the free Developer tier's 5K errors/month. Also added `app/global-error.tsx` — a real pre-existing gap (no top-level error boundary existed at all) that Sentry's own setup surfaced. Safe with no live Sentry project yet: DSN env vars are optional (SDK no-ops if unset), source-map upload skips gracefully without `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`.
- **3.6** ✅ — Playwright installed and configured (`playwright.config.ts`, dedicated port 3100 to avoid colliding with any locally-running dev server), plus two smoke tests establishing the per-screen pattern `ui-verifier` extends going forward (home page loads; login page renders its form) — both verified passing against a real dev server.
- **3.7** ⏳ **— needs the user's hand, not code.** `prisma/schema.prisma`'s `directUrl = env("DIRECT_URL")` wiring is already correct; the actual problem is that `.env`'s `DIRECT_URL` *value* is set to the same pooled connection string as `DATABASE_URL` (flagged in `04-decisions.md` 2026-09-09). Fix: grab the **unpooled** connection string (no `-pooler` in the hostname) from the Neon console for both the `main` and `redesign` branches, and put it in `DIRECT_URL` in `.env`/`.env.redesign` respectively. Not urgent (Neon's pooler tolerates DDL today), but worth doing before Phase 4 starts running migrations against the redesign branch.

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
