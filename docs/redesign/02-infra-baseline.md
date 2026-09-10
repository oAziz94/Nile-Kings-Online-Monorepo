# Infra baseline (Phase 2)

Measured 2026-09-10, before any Phase 3+ work touches infra. Purpose: give Phase 6's "did this help" comparison a real number to compare against, and ground the "open to swapping providers" decision in data instead of guesswork. Re-run before Phase 6 to see the delta.

## Neon (Postgres)

Measured directly via SQL (`pg_database_size`), no dashboard needed:

| Branch | Size | Tables |
|---|---|---|
| `main` (production) | 111 MB | 30 |
| `redesign` | 111 MB (identical — no schema drift yet) | 30 |

**Still needed from the Neon console** (Billing/Usage tab) — these aren't SQL-queryable:
- Compute hours used this billing period, vs. the plan's included hours.
- Active branch count (should be 2: `main` + `redesign`) and whether that's within the free tier's branch limit.

111 MB is small in absolute terms; the number that actually matters for cost is compute hours (Neon's free tier is usage-based on compute, not just storage), so that dashboard number is the one worth getting before drawing any conclusion about headroom.

## Cloudinary (images)

Measured directly via the Admin API's `usage` endpoint (current billing cycle):

| Metric | Usage | Notes |
|---|---|---|
| Plan | Free | 25 credits/month included |
| Credits used | 6.4 / 25 (25.6%) | |
| Storage | ~476 MB (0.46 credits) | 637 resources, 0 derived/eager resources |
| Bandwidth | ~5.92 GB (5.92 credits) | **92% of all credit usage comes from bandwidth alone** |
| Transformations | 21 (0.02 credits) | Negligible |
| API requests (period) | 18,759 | |

**Bandwidth is the entire cost story here, not storage or transformations.** This directly validates the already-approved Phase 6 item "consistent `next/image` + Cloudinary `f_auto,q_auto`" (`02-proposals.md`) — that's the lever that actually moves this number, since transformation/storage costs are already near-zero. At current usage (~25.6%/month), there's real headroom before the free tier becomes a problem, but bandwidth is the metric to re-check after Phase 6's image-pipeline work lands, not storage.

## Upstash Redis (cache/rate-limiting)

Measured directly via the data-plane REST API (key count + memory snapshot):

| Metric | Value |
|---|---|
| Keys (at snapshot time) | 1 |
| Memory used | ~0 B (of 64 MB max) |
| Connected clients | 1 |

This is a point-in-time snapshot, not a usage-over-time metric — the low key count is expected and not a red flag: OTP rate-limit keys (60s–15min TTL) and the analytics cache (5min TTL) both expire quickly, so an idle moment naturally shows almost nothing standing. It does confirm the connection/config is healthy.

**Still needed from the Upstash console** (dashboard homepage, front and center):
- Commands processed this month, vs. the 500K free-tier ceiling — this is an account-level billing metric with no data-plane API equivalent, so it can't be pulled programmatically with the credentials the app itself holds.

## Vercel (hosting)

**Not measurable from here at all** — no Vercel CLI is authenticated in this environment, and there's no token configured for API access. Needs a quick manual check on your end (Project → Usage tab):
- Current plan tier (Hobby/Pro/Enterprise).
- Build minutes used this month.
- Function invocations this month.
- Bandwidth this month.

## What this means for the "open to swapping providers" decision

Nothing measured so far suggests any provider is close to a real ceiling — Cloudinary is the only one with a somewhat meaningful usage number (25.6% of free-tier credits), and it's already got an approved fix queued (Phase 6 image pipeline) that should reduce it further, not require an upgrade. Neon and Upstash both look comfortably idle at current traffic. The Vercel numbers are the one real gap — since Vercel's free/Hobby tier is the one most likely to actually bind (build minutes and function-invocation limits are often the first thing a growing Next.js app hits), it's worth getting those three numbers before Phase 6 makes any provider-swap call.
