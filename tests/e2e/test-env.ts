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

  const prodEnvPath = path.join(root, ".env");
  if (!fs.existsSync(prodEnvPath)) {
    throw new Error(".env not found — cannot verify the loaded DATABASE_URL isn't production.");
  }
  const prodDatabaseUrl = dotenv.parse(fs.readFileSync(prodEnvPath)).DATABASE_URL;
  // 2026-09-13 (docs/redesign/03-backlog.md, Partner portal follow-up (c)): the user
  // removed DATABASE_URL/DIRECT_URL from production .env directly, so it's structurally
  // impossible for this process's DATABASE_URL to equal production's — there's nothing to
  // compare against. Treat a missing prod URL as "definitely not production" rather than
  // aborting the whole suite (the previous behaviour here, before that change landed).
  if (!prodDatabaseUrl) return;

  const loadedHost = new URL(loadedUrl).hostname;
  const prodHost = new URL(prodDatabaseUrl).hostname;

  if (loadedHost === prodHost) {
    throw new Error(
      `Refusing to run: this e2e process's DATABASE_URL points at the same host as production (${prodHost}). ` +
        `This suite seeds/deletes real rows — it must run against the redesign Neon branch only. ` +
        `Check that .env.redesign exists and defines a different DATABASE_URL than .env.`
    );
  }
}
