# Redesign — standing decisions

Running log of settled calls, so later tasks don't relitigate them. Add new entries at the top with a date.

## 2026-09-09 — Branching & versioning

- **Branching**: all redesign work happens off a long-lived `redesign` branch, created from `main` at the tag `pre-redesign-baseline`. `main` stays production and keeps shipping urgent fixes independently. Every `ui-implementer` task branches off `redesign` (not `main`) and PRs back into `redesign`. Periodically merge `main` → `redesign` to absorb production fixes and avoid a painful merge at the end. `redesign` only merges into `main` when a surface (or the whole redesign) is verified ready to ship — no direct-to-`main` merges from task branches.
- **Vercel preview safety**: confirm in the Vercel project dashboard that only `main` is set as the Production branch — this repo relies on Vercel's default per-branch preview deployments, so `redesign` and its PRs get their own preview URLs without touching the production domain. This is a dashboard setting, not something in the repo, so it needs manual confirmation (not done by this session).
- **Versioning**: `package.json#version` is the single source of truth (no other file references it). Policy: `main` continues normal semver (patch/minor) for production fixes shipped independently of the redesign. The `redesign` branch carries a prerelease version — `1.0.0-redesign.<n>` — bumped (`n` incremented) at the close of each phase in `03-backlog.md`, via `npm version prerelease --preid=redesign` (updates `package.json` + `package-lock.json` together and creates a git tag). Choosing `1.0.0` as the eventual release marks this as the first "1.0" of the product (current `0.x` was pre-1.0 iterative development) — when the redesign merges to `main`, it ships as `1.0.0`.
- A tag `pre-redesign-baseline` marks the exact `main` commit the redesign diverged from, for reference/rollback.

## 2026-09-09 — Setup

- **Scope**: all four surfaces are in play — `(public)` storefront, `(admin)` dashboard, `(partner)` portal, `(auth)` pages.
- **Orchestration**: the main session acts as PM — breaks work into backlog tasks, dispatches `ui-implementer` and `ui-verifier` subagents per task, reviews the verifier's report, closes or bounces the task. No separate sessions, no autonomous scheduled loop for now.
- **Model tier**: both `ui-implementer` and `ui-verifier` run on Sonnet. Chosen over a cheaper implementer tier for quality/consistency on a clean-slate rebuild; revisit per-phase if the backlog proves repetitive enough for a cheaper tier once the pattern is proven.
- **Design basis**: clean-slate visual identity, built in Claude Design (see `01-design-system.md`), not an evolution of current styling. Functionality must still match `00-feature-inventory/` exactly unless a task is explicitly sourced from an approved item in `02-proposals.md`.
- **PM latitude**: full — the PM (this session) proposes new features and library/infra swaps freely; the user approves/rejects per item. See `02-proposals.md` for the current approved list.
- **Infra**: open to swapping providers (hosting, DB tier, CDN, image host, etc.), but only after baseline usage is measured (Phase 2) — no swap on instinct alone.
- **Redis (Upstash)**: currently free-tier / unpaid (confirmed by user 2026-09-09). REST-based (`lib/redis.ts`), already used for OTP rate limiting (`lib/redis/otp-limits.ts`) and analytics caching (`lib/cache/analytics.ts`). Safe to route more read-heavy caching through it without new cost — add usage monitoring so we see it coming before it would cross into a paid tier.
- **Component base**: `components/ui` already follows the shadcn/ui pattern (CVA + clsx + tailwind-merge + Radix primitives: badge, button, card, dialog, input, label, select, table, toast, toaster). Decision: expand this set rather than adopt a different component library — add the missing Radix primitives (dropdown-menu, tabs, popover, tooltip, checkbox, radio-group, switch, form) as needed per screen.
- **Forms**: standardize on `react-hook-form` + the existing Zod schemas (already used server-side) via `@hookform/resolvers/zod`, instead of ad hoc form state.
- **Admin/partner data**: standardize on TanStack Table for data-grid screens and TanStack Query for client-side fetching/caching in admin + partner portals.
