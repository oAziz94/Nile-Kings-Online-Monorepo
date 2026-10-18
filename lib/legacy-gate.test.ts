/**
 * Grep gate for backlog 11.8: the agent-distributor network feature is gone. If any of these
 * strings reappears in shipping code (app, lib, components, hooks) the build fails here.
 * Tests (`*.test.*`), docs, migrations and the e2e suite are not scanned.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const DIRS = ["app", "lib", "components", "hooks"];
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
const FORBIDDEN = ["linkedAgent", "RestockRequest", "restock-requests", "موزع", "طلبات التوريد"];
/** Files allowed to contain a forbidden string, with the reason. Empty on purpose. */
const ALLOWED: Record<string, string[]> = {};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    const dot = name.lastIndexOf(".");
    if (dot < 0 || !EXTENSIONS.has(name.slice(dot))) continue;
    if (/\.test\./.test(name)) continue;
    out.push(full);
  }
}

describe("legacy network gate (11.8)", () => {
  it("no shipping file mentions the removed agent-distributor network", () => {
    const files: string[] = [];
    for (const d of DIRS) walk(join(ROOT, d), files);
    expect(files.length).toBeGreaterThan(100);

    const hits: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file).split("\\").join("/");
      const text = readFileSync(file, "utf8");
      for (const word of FORBIDDEN) {
        if (text.includes(word) && !(ALLOWED[rel] ?? []).includes(word)) hits.push(`${rel}: ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
