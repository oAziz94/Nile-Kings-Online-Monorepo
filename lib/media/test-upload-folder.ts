/**
 * Guard for `POST /api/admin/upload`'s `nile-kings/products/e2e-<suffix>` folder override
 * (backlog 9.8a; verifier fix, NEEDS REWORK item 1 — the override was previously accepted from
 * any admin session in any environment). The override exists only so
 * `tests/e2e/admin-v2-media.spec.ts` can scope and clean up its own Cloudinary uploads without
 * touching the real `nile-kings/products` folder; it must be unreachable anywhere the flag
 * below isn't explicitly set by the test harness itself — never in `.env`/`.env.redesign`, only
 * in `playwright.config.ts`'s `webServer.env`.
 */

/** Matches only the exact `nile-kings/products/e2e-<suffix>` shape the tests use. */
export function isE2eUploadFolder(folder: string): boolean {
  return /^nile-kings\/products\/e2e-[\w-]+$/.test(folder);
}

/** Both conditions must hold: never in a production `NODE_ENV`, and the flag must be set —
 * which only happens when this process was started by Playwright's `webServer`. */
export function testUploadFolderAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.ALLOW_TEST_UPLOAD_FOLDER === "1";
}
