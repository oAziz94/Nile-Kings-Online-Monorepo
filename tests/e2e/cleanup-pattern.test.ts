import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Backlog 10.10 — repo guard for the pattern that emptied `PartnerInventory` in production
 * data terms (see docs/redesign/04-decisions.md, "The night a test emptied the stock
 * table"): a `deleteMany`/`.delete`/`updateMany` call whose `where` names a bare scalar
 * (`{ variantId }` shorthand, or `variantId: invVariantId`) rather than going through
 * `deleteByIds`/`definedIds`/`safeWhere` (or an explicit `{ in: [...] }` list). Any such
 * call can silently become an unfiltered delete if the variable is ever undefined.
 *
 * This test does not run against a database — it reads the `tests/e2e/**\/*.ts` source
 * files as text and flags the shape of the call, not its runtime behaviour.
 */

const E2E_DIR = path.resolve(__dirname);

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

/** Finds the text of a balanced-parenthesis call starting right after `openParenIndex`. */
function extractBalanced(text: string, openParenIndex: number): { argsText: string; endIndex: number } {
  let depth = 1;
  let i = openParenIndex + 1;
  for (; i < text.length && depth > 0; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
  }
  return { argsText: text.slice(openParenIndex + 1, i - 1), endIndex: i };
}

function lineNumberAt(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index; i++) {
    if (text[i] === "\n") n++;
  }
  return n;
}

function lineTextAt(text: string, index: number): string {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  return text.slice(start, end === -1 ? text.length : end);
}

/** The offending line's own text, plus the line directly above it (a `// cleanup-safe:`
 * comment is allowed to sit on either, since it usually reads better just above the call
 * it excuses than crammed onto an already-long line). */
function lineAndPrecedingLineAt(text: string, index: number): string {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const prevLineStart = lineStart > 0 ? text.lastIndexOf("\n", lineStart - 2) + 1 : 0;
  const end = text.indexOf("\n", index);
  return text.slice(prevLineStart, end === -1 ? text.length : end);
}

// Only real Prisma delegate calls — `prisma.<model>.deleteMany(`/`.delete(`/`updateMany(`, or
// `delegate.deleteMany(` (the shape `db-cleanup.ts`'s own helpers use). Deliberately does NOT
// match e.g. `page.request.delete(...)` (an HTTP call, not a database one) — a template
// literal argument like `` `/api/x/${assetId}` `` would otherwise read as `{assetId}` shorthand
// to a naive scan.
const CALL_MARKER_PATTERN = /\b(?:prisma\.\w+|delegate)\.(deleteMany|delete|updateMany)\(/g;

// Shorthand `{ someId }` / `{ someId,` / `, someId }` / `, someId,` — an object-literal
// property shorthand naming a bare id with no explicit value.
const SHORTHAND_ID = /[{,]\s*([A-Za-z_$][\w$]*Id)\s*[,}]/g;

// `someId: bareIdentifier` — a direct scalar assignment, not an object/array literal, not
// a function call, and not the `in:` shape.
const BARE_ID_ASSIGNMENT = /\b([A-Za-z_$][\w$]*Id)\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}])/g;

type Violation = { file: string; line: number; snippet: string };

function findViolations(filePath: string, text: string): Violation[] {
  const violations: Violation[] = [];

  CALL_MARKER_PATTERN.lastIndex = 0;
  let call: RegExpExecArray | null;
  while ((call = CALL_MARKER_PATTERN.exec(text))) {
    const openParenIndex = call.index + call[0].length - 1;
    const { argsText, endIndex } = extractBalanced(text, openParenIndex);
    CALL_MARKER_PATTERN.lastIndex = endIndex;

    // Guarded through the helpers (or an explicit `in:` list) anywhere in this call's
    // arguments — the whole call is trusted, matching the backlog's "unless wrapped in
    // safeWhere(/definedIds(/{ in: }" exemption.
    const guarded = argsText.includes("safeWhere(") || argsText.includes("definedIds(") || /\{\s*in\s*:/.test(argsText);
    if (guarded) continue;

    const checks = [SHORTHAND_ID, BARE_ID_ASSIGNMENT];
    for (const pattern of checks) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(argsText))) {
        const absoluteIndex = openParenIndex + 1 + m.index;
        const context = lineAndPrecedingLineAt(text, absoluteIndex);
        if (context.includes("// cleanup-safe:")) continue;
        violations.push({ file: filePath, line: lineNumberAt(text, absoluteIndex), snippet: lineTextAt(text, absoluteIndex).trim() });
      }
    }
  }

  return violations;
}

describe("tests/e2e cleanup pattern guard", () => {
  it("has no deleteMany/.delete/updateMany call with a bare-scalar where filter", () => {
    const files = collectTsFiles(E2E_DIR).filter((f) => path.basename(f) !== "cleanup-pattern.test.ts");
    const violations = files.flatMap((f) => findViolations(f, fs.readFileSync(f, "utf-8")));

    if (violations.length > 0) {
      const message = violations
        .map((v) => `${path.relative(process.cwd(), v.file)}:${v.line}: ${v.snippet}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} unguarded cleanup filter(s) — a bare-scalar where can delete an ` +
          `unfiltered table if the variable is ever undefined (see docs/redesign/04-decisions.md, ` +
          `"The night a test emptied the stock table"). Wrap the id(s) in safeWhere()/definedIds()/` +
          `deleteByIds(), or an explicit "in:" list, or mark the line "// cleanup-safe: <reason>" if ` +
          `it is genuinely safe.\n\n${message}`
      );
    }
  });
});
