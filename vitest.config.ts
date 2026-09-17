import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    // Backlog 10.10 — tests/e2e/*.spec.ts are Playwright specs, not Vitest (they import
    // "@playwright/test" and run against a live dev server); tests/e2e/*.test.ts (the
    // db-cleanup helper unit test and its repo-wide guard test) are plain Vitest tests with
    // no DB/server dependency, so only *.spec.ts under tests/e2e is excluded here.
    exclude: [...configDefaults.exclude, "tests/e2e/**/*.spec.ts", ".claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
