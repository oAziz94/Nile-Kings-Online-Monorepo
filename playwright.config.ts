import { defineConfig, devices } from "@playwright/test";

// Runs against the redesign branch's dev server (never `npm run dev`, which
// points at the production database via .env) — see docs/redesign/04-decisions.md.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A dedicated port, not 3000 — avoids colliding with a dev server someone
    // may already have running locally for other work.
    command: "npm run dev:redesign -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
