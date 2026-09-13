import { describe, it, expect } from "vitest";
import { auditDiff } from "./admin-audit";

describe("auditDiff", () => {
  it("returns null when nothing changed", () => {
    expect(auditDiff({ name: "a", value: 1 }, { name: "a", value: 1 })).toBeNull();
  });

  it("returns null when both sides are empty/undefined", () => {
    expect(auditDiff(undefined, undefined)).toBeNull();
    expect(auditDiff({}, {})).toBeNull();
  });

  it("keeps only the keys whose value changed", () => {
    const diff = auditDiff({ name: "old", value: 1, other: "x" }, { name: "new", value: 1, other: "x" });
    expect(diff).toEqual({ before: { name: "old" }, after: { name: "new" } });
  });

  it("compares nested objects by JSON equality", () => {
    expect(auditDiff({ address: { city: "a" } }, { address: { city: "a" } })).toBeNull();
    expect(auditDiff({ address: { city: "a" } }, { address: { city: "b" } })).toEqual({
      before: { address: { city: "a" } },
      after: { address: { city: "b" } },
    });
  });

  it("nested arrays compared by JSON equality too", () => {
    expect(auditDiff({ tags: [1, 2] }, { tags: [1, 2] })).toBeNull();
    expect(auditDiff({ tags: [1, 2] }, { tags: [2, 1] })).toEqual({
      before: { tags: [1, 2] },
      after: { tags: [2, 1] },
    });
  });

  it("a key present on only one side counts as changed", () => {
    expect(auditDiff({ a: 1 }, { a: 1, b: 2 })).toEqual({ before: { b: undefined }, after: { b: 2 } });
    expect(auditDiff({ a: 1, b: 2 }, { a: 1 })).toEqual({ before: { b: 2 }, after: { b: undefined } });
  });

  it("multiple changed keys are all kept", () => {
    const diff = auditDiff({ a: 1, b: 2, c: 3 }, { a: 9, b: 2, c: 8 });
    expect(diff).toEqual({ before: { a: 1, c: 3 }, after: { a: 9, c: 8 } });
  });
});
