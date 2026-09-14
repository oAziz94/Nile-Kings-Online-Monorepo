import { defineConfig, devices } from "@playwright/test";

// Runs against the redesign branch's dev server (never `npm run dev`, which
// points at the production database via .env) — see docs/redesign/04-decisions.md.
//
// `PLAYWRIGHT_PORT` (backlog 4.9): multiple isolated worktrees can be verifying different
// tasks at once, and they'd otherwise all fight over the same long-running port-3100 server
// (see the 2026-09-11 ".next/ dir shared across two dev servers" gotcha in 04-decisions.md).
// Defaults to 3100 (unchanged) when unset.
const PORT = process.env.PLAYWRIGHT_PORT ? Number(process.env.PLAYWRIGHT_PORT) : 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  // Backlog 9.0d — warms the admin/partner/storefront entry routes once, right after the dev
  // server comes up, so the first real spec to hit each of them isn't the one that pays for
  // its cold Turbopack compile. See tests/e2e/global-setup.ts.
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A dedicated port, not 3000 — avoids colliding with a dev server someone
    // may already have running locally for other work.
    command: `npm run dev:redesign -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Backlog 9.8a verifier fix: `POST /api/admin/upload`'s `nile-kings/products/e2e-*` folder
    // override (used only by `admin-v2-media.spec.ts` to scope/clean up its own Cloudinary
    // uploads) is refused everywhere unless BOTH this flag and non-production NODE_ENV are
    // set — never set in `.env`/`.env.redesign`, only here, so the override is unreachable
    // outside a Playwright-started dev server.
    env: { ALLOW_TEST_UPLOAD_FOLDER: "1" },
  },
});
