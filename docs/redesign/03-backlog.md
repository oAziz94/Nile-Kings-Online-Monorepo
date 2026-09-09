# Redesign — phases & backlog

Phases run roughly in order; tasks within a phase can run in parallel once the phase's prerequisites (previous phase's decisions) are settled.

## Phase 0 — Feature inventory
Per-screen feature-parity checklists under `00-feature-inventory/`, covering all four surfaces. This is the grading rubric every later task is checked against. Not started.

## Phase 1 — Design system
Claude Design canvas: tokens, core components, four representative screens (see `01-design-system.md`). Not started.

## Phase 2 — Infra baseline
Instrument current Vercel/Neon/Upstash/Cloudinary usage before any provider decisions. Produces the data behind any later infra swap. Not started.

## Phase 3 — Foundation build
Design tokens → `tailwind.config.ts`; expand `components/ui` primitives; wire `react-hook-form` + Zod resolver; set up TanStack Query/Table scaffolding; add Sentry (see `04-decisions.md`); set up Playwright and the pattern for a per-screen smoke test. This is shared infrastructure every screen task in Phase 4 depends on. Not started.

**Precondition for Phase 4, not part of Phase 3 itself**: the `redesign` Neon database branch must exist (user-created, see `04-decisions.md`) before any task that needs a schema change.

## Phase 4 — Surface rebuilds
Proposed order: Auth (smallest surface, proves the implement→verify loop) → Public storefront → Partner portal → Admin dashboard. Each screen is its own task: implementer builds against its Phase-0 checklist + Phase-1 design, verifier checks it, PM closes or bounces it. Not started — tasks get listed here once Phase 0 + Phase 1 are far enough along to write them concretely.

## Phase 5 — New features
Approved items from `02-proposals.md`, layered in per-surface once that surface's parity rebuild (Phase 4) is verified. Not started.

## Phase 6 — Performance & cost pass
Apply `02-proposals.md` performance items (ISR, Redis caching, image pipeline, server-components audit) using the Phase 2 baseline to confirm improvement. Decide on any infra swap here, with data. Not started.

---

_No tasks are listed yet — they get added here once Phase 0 (inventory) is underway, so each task can reference a real checklist file instead of a placeholder._
