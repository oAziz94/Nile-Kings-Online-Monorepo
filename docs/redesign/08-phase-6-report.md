# Phase 6 report — performance and cost pass

Date: 2026-09-19. Branch `redesign`, v2.4.14 → v2.4.19. Owner instruction: "start phase 6".

## Why these tasks and not others

Phase 2 measured the bills. Vercel was about $40 of a $47 month, and two lines made most of it: Web Analytics Events ($10.71, a package nobody read) and function invocations plus the CPU they burn ($21.77 across two lines, 8.26M invocations). Cloudinary's cost was 92% bandwidth. Neon and Upstash were negligible. So the phase was built as five small changes, each aimed at one of those three numbers, plus a re-measure. No rewrite, no provider swap until the delta is on paper.

Three rulings were taken up front and recorded in `04-decisions.md`: the governorate routing lookup is cached with `revalidateTag`, not Redis (same immediate invalidation, zero Upstash commands); one bootstrap request replaces four client fetches rather than server-rendering the session in the layout (which would have made every route dynamic, including the one ISR page); no ISR on the home page and product page, because both read the location cookie for partner stock and the heavy query under each is already memoized. Dependency bumps stay within majors.

## What was done, task by task

**6.1 — Drop Vercel analytics.** One import, one element, one dependency removed. Done by the PM directly. Expected effect: the $10.71 line goes to zero next period.

**6.2 — One storefront bootstrap request.** Before, every storefront page fired four client requests on first paint before any content: current user, governorate address, coupon popup messages, and the cart. Each was a Vercel invocation and a Neon query. Now a single `GET /api/storefront/bootstrap` returns all four in one handler, run in parallel, and a provider in the public layout hands the result to the navbar, the mobile drawer, the governorate pill, the coupon dialog, and the cart. The four original endpoints still exist for their write and refresh paths (save address, add to cart, logout, drawer refresh). Verified live: home, category and product pages each make exactly one layout request and none of the four they replace.

The first version failed verification. When the bootstrap request itself failed (a deploy blip, a database hiccup), the governorate component could not tell "no address saved" from "request failed" and force-opened the address modal with an empty governorate list, no Cancel button, no Escape, no backdrop click. A guest would be stuck. The implementer's own tests passed because they only covered the happy path; the verifier found it by deliberately failing the request. The rework: on bootstrap failure the component retries with its own governorate request; if that fails too, no forced modal, the pill shows "اختر محافظتك" and the modal opens by hand with the built-in governorate list; and the modal now closes on Escape and backdrop click regardless of why it opened. The normal first-visit behaviour (modal opens automatically, asks for governorate and area, saves, reloads) is unchanged. Re-verified live, including the happy path.

**6.3 — Cache tags.** Every catalog cache (product listing, product detail, related, recommendations, categories, category filters, product filters, menu, home) now carries tags, and every admin write that changes what those caches hold (products, variants, colours, categories, bulk edit, media hero/assign/replace/sync) invalidates them immediately through one helper. Before, an admin edit waited out a 60 to 300 second window. The governorate-to-partner lookup, one database query on nearly every storefront request, is now cached per governorate and invalidated by the rerouting-rule routes, including the partner-link routes the brief had not listed. Verified live: a product rename shows on the product page and in the listing API on the very next request; deactivating a rerouting rule flips stock on the product page on the next request.

Side finding: deleting a product that still has variants answered a raw Postgres 500. The schema restricts that on purpose (order lines reference variants), so the route now answers a 409 in Arabic saying to delete the variants first or deactivate the product. The admin v2 UI never calls product delete, so no customer-facing path was affected.

**6.4 — Cloudinary loader.** Catalog images now go straight from Cloudinary with `f_auto,q_auto,c_limit,w_<width>` through a `next/image` loader and a shared `CatalogImage` wrapper, instead of round-tripping through Vercel's image optimizer. Proven against the real account: an 81,537-byte original JPEG is served as a 10,492-byte WebP at the requested width. Static brand images stay on the default path.

The first version missed two thumbnails (mini-cart drawer and checkout summary), proven live still going through Vercel. The rework converted them, and also fixed a sizing bug the verifier noticed: the home page rails inherited the grid's width hint and asked Cloudinary for 3840-pixel images for a 312-pixel card. Rails now request 384 or 256 pixels depending on viewport.

**6.5 — Dependency patch pass.** Next 15.5.12 → 15.5.25 (includes the 15.5.21 SSRF and cache-confusion fixes and the 15.5.24 image-optimization and Windows RCE fixes), Sentry 10.74 → 10.75, React 19.2.4 → 19.2.8. React 19.3.0 was tried first and broke the store settings save on `/admin/settings` reliably. Bisected one package at a time: old versions pass 2 of 2; Next 15.5.25 with old React passes; React 19.3.0 alone fails 2 of 2; React 19.2.8 passes 2 of 2 plus the whole settings spec. React is pinned to 19.2 until a later 19.3 patch is retested. Full Playwright suite on the final set: 340 passed; the four failures all passed when rerun alone (two were collisions with the 10.19 run on the shared test DB, one a rate-limit counter shared in Redis) or are the known 10.11. Console output on six pages identical before and after.

**10.19 — Production build broken since 2026-09-14.** Found by 6.5's build, the first production build anyone had run in five days. The five partner report page files exported their view components for the admin pages to reuse, and Next rejects extra exports from page files at build time. The views moved to `components/partner/reports/*-report-view.tsx` (bodies byte-identical), the pages keep only their default export, all importers updated. Build green. A `build:redesign` script was added because the plain build cannot run locally (`.env` carries no database URL). New rule: the PM runs a production build before every version bump.

**6.6 — Re-measure.** Not started. It needs the Vercel usage tab and the Cloudinary usage page for the first full period after deploy; the deltas go next to each Phase 2 number in `02-infra-baseline.md`, and only then does the provider-swap question reopen.

## How the work ran

Each task went to an implementer in its own worktree, then to an independent verifier that could run the app and tests but not edit code, then to the PM for merge. Two of five tasks failed their first verification (6.2, 6.4) and were reworked and re-verified. That is the loop working as intended: both misses were real and would have reached customers.

Process findings: agent worktrees have no env files, so the PM copies them in without reading them; two specs that share fixture phones must never run concurrently against the test DB (it caused both collisions); the test DB was checked read-only afterwards and holds no leftover fixture rows.

## Expected effect on the bill

| Line | Before (Phase 2) | Change | Expected |
|---|---|---|---|
| Web Analytics Events | $10.71 | package removed | $0 |
| Function invocations | 8.26M, $4.96 | 3 fewer per storefront page view; admin edits no longer wait on cache windows | materially lower; measure |
| Fluid Active CPU | $16.81 | same drivers as invocations | lower; measure |
| Image Optimization (3 lines) | $0.47 | catalog images no longer pass through Vercel | ~$0 |
| Cloudinary bandwidth | 5.92 GB, 92% of credits | WebP/AVIF at rendered width | large drop; measure |

## Still open after this phase

- Main checkout `node_modules` still on the old versions until `npm install` runs between the owner's manual-test sessions, then restart the dev server.
- 6.6 re-measure after deploy.
- 10.11 (today spec assumes an empty test DB; test-only, about an hour).
- N1 to N13, parked for the next release.
- Deploy: env vars, the two 2026-09-14 migrations, media sync (`05-partner-portal-v2.md` §5). The build blocker is gone.
