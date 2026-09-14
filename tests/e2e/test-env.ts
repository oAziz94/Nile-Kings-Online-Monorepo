import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

/**
 * Loads env for e2e specs that seed/query the database directly via Prisma, and
 * refuses to proceed if the result would point at production.
 *
 * Incident (2026-09-10, see docs/redesign/04-decisions.md): tests/e2e/auth-login.spec.ts
 * originally loaded only `.env`, writing its Prisma-seeded fixture users straight into
 * PRODUCTION instead of the `redesign` Neon branch. The immediate fix (load
 * `.env.redesign` first, with `override: true` — Prisma's own env auto-load can already
 * have set DATABASE_URL before this file's code runs) closed that specific hole, but
 * still depends on `.env.redesign` existing on whatever machine runs the suite. This
 * guard is the backstop: it aborts the whole process immediately, before any Prisma
 * client is constructed, if the loaded DATABASE_URL's *host* matches production's host
 * (parsed from `.env` directly — never process.env, which may not be production even
 * when it should be, so comparing against it would defeat the point of the check).
 *
 * Only hostnames are ever compared or logged — never full connection strings
 * (credentials) — matching this repo's standing rule not to print secret values.
 */
export function loadRedesignTestEnv(root: string = path.resolve(__dirname, "../..")): void {
  dotenv.config({ path: path.join(root, ".env.redesign"), override: true });
  dotenv.config({ path: path.join(root, ".env") });

  const loadedUrl = process.env.DATABASE_URL;
  if (!loadedUrl) {
    throw new Error("DATABASE_URL is not set after loading .env.redesign/.env — cannot verify this isn't production.");
  }

  // Production's Neon endpoint is pinned here as a literal because `.env` no longer carries
  // a DATABASE_URL at all (2026-09-13 safety change) — deriving the host from `.env` would
  // make this guard silently vacuous. If production ever moves, update this constant.
  const loadedHost = new URL(loadedUrl).hostname;
  const prodEnvPath = path.join(root, ".env");
  const prodDatabaseUrl = fs.existsSync(prodEnvPath) ? dotenv.parse(fs.readFileSync(prodEnvPath)).DATABASE_URL : undefined;
  const prodHosts = new Set<string>([PRODUCTION_DB_HOST_PREFIX]);
  if (prodDatabaseUrl) prodHosts.add(new URL(prodDatabaseUrl).hostname);

  const matched = [...prodHosts].find((h) => loadedHost === h || loadedHost.startsWith(h));
  if (matched) {
    throw new Error(
      `Refusing to run: this e2e process's DATABASE_URL points at production (${matched}). ` +
        `This suite seeds/deletes real rows — it must run against the redesign Neon branch only. ` +
        `Check that .env.redesign exists and defines the redesign branch's DATABASE_URL.`
    );
  }

  // Backlog 9.8a — the same flag `playwright.config.ts`'s `webServer.env` sets for the dev
  // server process; setting it here too covers this (the test) process for any helper that
  // reads it directly (e.g. `lib/media/test-upload-folder.ts`'s guard used in a unit test).
  // Never set in `.env`/`.env.redesign` themselves.
  process.env.ALLOW_TEST_UPLOAD_FOLDER = "1";
}

/** Production Neon endpoint id (hostname prefix; the `-pooler` and direct hosts both start with it). */
const PRODUCTION_DB_HOST_PREFIX = "ep-hidden-butterfly-agp3sg0e";

/**
 * Backlog 9.0c — the routing e2e's "no rule yet" path (a governorate whose mode select has
 * never been touched, so choosing a mode creates the row for the first time) needs a real
 * `GOVERNORATE_OPTIONS` row (`lib/services/shipping.ts`) with no `ReroutingRule`. By the time
 * 9.0c ran, all 27 governorates already had one, seeded 2026-04-02 with one partner each and
 * zero `RoutedOrder`s ever assigned through them (verified via a guarded one-off before
 * deleting anything) — i.e. setup data, not live routing state.
 *
 * "الوادي الجديد" (New Valley — Egypt's lowest-population governorate, so the least likely
 * to ever carry real routed-order traffic) is reserved for this purpose: its `ReroutingRule`
 * was deleted by a guarded one-off (`node --env-file=.env.redesign`, host-asserted, not
 * committed) as part of 9.0c, and this is the ONE sanctioned exception to "never delete a
 * ReroutingRule" (04-decisions.md / 03-backlog.md 9.5a's standing rule) — every other
 * governorate's rule is still off-limits. `admin-v2-routing.spec.ts`'s
 * "mode select creates the rule on first change" test runs against this real row and its own
 * `afterAll` deletes whatever rule it creates, restoring the "no rule" state for the next run.
 */
export const ROUTING_TEST_GOVERNORATE = "الوادي الجديد";
