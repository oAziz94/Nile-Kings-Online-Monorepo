# Infra baseline (Phase 2)

Measured 2026-09-10, before any Phase 3+ work touches infra. Purpose: give Phase 6's "did this help" comparison a real number to compare against, and ground the "open to swapping providers" decision in data instead of guesswork. Re-run before Phase 6 to see the delta.

## Neon (Postgres)

Measured directly via SQL (`pg_database_size`), no dashboard needed:

| Branch | Size | Tables |
|---|---|---|
| `main` (production) | 111 MB | 30 |
| `redesign` | 111 MB (identical — no schema drift yet) | 30 |

**From the Neon console, billing period Sep 1 – Oct 1, 2026:**

| Metric | Value |
|---|---|
| Plan | **Launch** (paid — corrects an earlier assumption, see below) |
| Compute | 62.45 compute hours → $6.58 |
| Storage (root branches) | 0.04 GB-month → $0.01 |
| Total charges to date | **$6.59** |

**Correction to `04-decisions.md` 2026-09-09**: that entry assumed Neon's *free* tier ("up to 10 branches/project on the free tier, ~$1.50/branch-month beyond that"). The account is actually already on the **Launch** plan (paid, usage-based: $0.35/GB-month storage beyond what's included, autoscale to 16 CU, 10 branches included per project, 500 GB public network transfer included). This doesn't change the redesign-branching decision itself — branching is still effectively free at this scale, since Neon's copy-on-write model means the `redesign` branch adds close to zero marginal storage (confirmed above: both branches measure identically at 111 MB) and the $6.59/period figure already reflects both branches' combined compute — but the earlier "free tier" framing in the decisions log was wrong and should be read with this correction in mind.

111 MB storage and $6.59/period in total charges — Neon is not a cost concern at current scale.

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

**From the Upstash console dashboard**, confirms the snapshot above at the monthly level:

| Metric | Usage | Free-tier ceiling |
|---|---|---|
| Commands | 1.2K (642 writes, 605 reads) | 500K/month |
| Bandwidth | 0 B | 50 GB |
| Storage | 25 B | 256 MB |
| Cost | $0.00 | — |

Confirmed: genuinely negligible usage, free tier, effectively zero risk of hitting a ceiling at current traffic. Not a cost or capacity concern.

## Vercel (hosting)

**From the Vercel dashboard's Usage tab** (current period; exact plan tier not confirmed from what was shared, but the presence of Fluid Compute usage-based billing lines rules out the plain Hobby tier):

| Line item | Usage | Cost |
|---|---|---|
| Fluid Active CPU | 131 hours | **$16.81** |
| Web Analytics Events | 356.89K events | **$10.71** |
| Fluid Provisioned Memory | 505.14 GB-Hrs | $5.36 |
| Function Invocations | **8.26M** | $4.96 |
| Fast Origin Transfer | 21 GB | $1.39 |
| Edge Requests — Additional CPU Duration | 1 hour | $0.43 |
| Image Optimization Transformation | 3.91K | $0.23 |
| Image Optimization Cache Writes | 31.56K | $0.13 |
| Image Optimization Cache Reads | 277.08K | $0.11 |
| Build CPU Minutes | 2 hours | $0.03 |
| Fast Data Transfer | 236 GB / 1 TB included | $0.00 |
| ISR Reads | 6.9K | $0.00 |
| **Total (this period)** | | **≈ $40.16** |

**This is the real cost driver, by a wide margin — Vercel dwarfs Neon ($6.59) and Cloudinary/Upstash (both effectively free) combined.** Two findings worth acting on directly:

1. **Web Analytics Events is the #2 cost line at $10.71/period (356.89K events) — this is exactly the `@vercel/analytics` package `02-proposals.md` already approved dropping.** This baseline turns that from "a reasonable idea" into a confirmed, quantified saving — removing it should cut this line to $0 next period.
2. **Function Invocations at 8.26M is a strikingly high number** for a single-market storefront at this traffic level, and Fluid Active CPU ($16.81) is the single largest line item overall. Both point the same direction: a lot of separate small server round-trips. This matches patterns the feature inventory already flagged independently — e.g. `partner-shell.tsx` re-fetching `/api/partner/me` on nearly every partner page rather than sharing one fetch, the PDP firing a fresh analytics-view call on every mount, `GovernorateSelector` fetching on every page load — all things the already-approved "server-components-first audit" and targeted-Redis-caching items in `02-proposals.md` are meant to address. This baseline gives that work a concrete number to bring down, not just a code-quality goal.

## What this means for the "open to swapping providers" decision

**Correction to the earlier draft of this doc**: real numbers show Vercel is not a "check later" item — it's already the dominant cost (~$40/period vs. Neon's ~$6.59 and Cloudinary/Upstash's ~$0), and two already-approved Phase 6 items (dropping Vercel Analytics; the server-components/redundant-fetch audit) map directly onto its two biggest line items. No provider swap looks warranted right now — the right move is executing the Phase 6 items already on the list and re-measuring, since a meaningful chunk of today's ~$40/period looks self-inflicted (redundant fetches, a redundant analytics package) rather than a real traffic ceiling. Re-run this baseline after Phase 6 lands to see the actual delta before considering any swap.

## 6.6 re-measure — 2026-10-01 (cycle Sep 3 – Oct 3, Vercel; last 30 days, Cloudinary)

**Caveat first:** this cycle is not a clean before/after. The owner ran a very successful ad campaign in the first week of September (Vercel daily spend $4–16 on Sep 4–11); the old site became very slow under that load (functions in iad1, DB in Frankfurt — see 04-decisions 2026-09-29) and traffic fell away; the v2 cutover followed on Sep 20. So the totals below mix "campaign on the old site" with "lower traffic on the new site", and the only clean comparison is the **daily run-rate since Sep 12: ≈ $0.30–0.50/day** (≈ $12/month, inside the $20 Pro credit). The real test of v2's cost per visitor is the next campaign, now on fra1.

| Line item | Baseline (Sep 9 read) | Sep 3 – Oct 3 | Note |
|---|---|---|---|
| CDN Requests | — (not billed then) | 18.75M / 10M incl. → $22.44 | campaign week; billed only above 10M |
| Fluid Active CPU | 131 h → $16.81 | 159 h → $20.57 | almost all in the campaign week |
| Fluid Provisioned Memory | 505 GB-h → $5.36 | 658 GB-h → $7.00 | |
| Function Invocations | 8.26M → $4.96 | 9.6M → $5.76 | |
| Fast Origin Transfer | 21 GB → $1.39 | 29 GB → $1.86 | |
| Image Optimization Transformation | 3.91K → $0.23 | 6.01K → $0.35 | ≈ $0.06 per 1K — cheap |
| Image Opt. Cache Writes / Reads | 31.6K / 277K → $0.24 | 53K / 454K → $0.39 | |
| Web Analytics Events | 356.89K → $10.71 | not in the table (package removed in Phase 6) | saving confirmed |
| Fast Data Transfer | 236 GB / 1 TB | 270 GB / 1 TB | $0 |
| **Total** | ≈ $40 | $20 credit + **$51.01** on-demand | |

**Cloudinary (free plan, 25 credits/month):**

| | Baseline | Last 30 days |
|---|---|---|
| Bandwidth | 5.92 GB | **35.16 GB** |
| Transformations | 21 | **10,556** |
| Image impressions | ~2K/day | **20–30K/day from Sep 19** |
| Storage | 0.46 GB | 1.36 GB |
| Credits | 6.4 / 25 | **≈ 47 / 25** — "outgrown the Free plan" banner |

**Finding:** the Cloudinary jump is at the cutover, not at the campaign. Backlog 6.4 pointed `next/image` at Cloudinary directly (`cloudinaryLoader`: `f_auto,q_auto,c_limit,w_<n>`), expecting to cut both Vercel image cost and Cloudinary bandwidth. The first held; the second was wrong: Vercel's optimizer fetched each photo from Cloudinary once per size and served it from its own cache, so Cloudinary only ever paid for origin fetches. Now every impression is Cloudinary bandwidth. Vercel's image lines at this traffic cost ≈ $0.75/month; Cloudinary's next plan is $89/month, and a free account at ~2× its limit risks delivery being throttled. **Decision:** revert to Vercel-cached delivery with Cloudinary as origin, but cap the origin (`c_limit,w_1600,q_auto`) so each fetch is small, and set `images.minimumCacheTTL` to 31 days — backlog 10.42.

**Provider-swap question:** still no. Vercel is ≈ $20 flat at current traffic; the campaign week cost ≈ $50 on top, which is the cost of success and would be partly offset next time by fra1 (fewer long-running functions). Neon ≈ $6.6, Upstash $0, Cloudinary back to free once 10.42 lands.
