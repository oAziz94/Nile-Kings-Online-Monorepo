import type { FullConfig } from "@playwright/test";

/**
 * Backlog 9.0d — cold-compile flakiness: three verifications in a row saw a first-run
 * timeout on a cold Turbopack dev server (a save/PATCH request compiling its route on
 * first hit) that passed warm. `playwright.config.ts`'s `webServer` starts the dev server
 * fresh for every run; this global setup requests each of these routes once, sequentially,
 * right after the server is reachable (Playwright runs `globalSetup` after `webServer` is
 * up) so every route's first real compile happens here — under this file's own generous
 * timeout, not a test's — rather than inside the first spec that happens to hit it.
 */
const WARM_ROUTES = ["/login", "/admin", "/admin/orders", "/admin/partners", "/partner", "/partner/orders", "/products"];

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL as string | undefined;
  if (!baseURL) return;

  for (const route of WARM_ROUTES) {
    try {
      // AbortSignal.timeout keeps one slow/hanging route from blocking the rest of the warm-up
      // indefinitely — a route that fails to warm here just compiles on the first spec that
      // hits it instead, same as before this global setup existed.
      await fetch(`${baseURL}${route}`, { signal: AbortSignal.timeout(45_000) });
    } catch {
      // Best-effort warm-up only; a failed request here is not a test failure.
    }
  }
}
