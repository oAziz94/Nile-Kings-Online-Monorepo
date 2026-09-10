import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
