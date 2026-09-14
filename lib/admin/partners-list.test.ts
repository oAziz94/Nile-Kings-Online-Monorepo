import { describe, expect, it } from "vitest";
import { coverTone } from "./partners-list";

describe("coverTone", () => {
  it("null (no measurable velocity) has no tone", () => {
    expect(coverTone(null)).toBeNull();
  });

  it("< 7 days is dangerous (d)", () => {
    expect(coverTone(0)).toBe("d");
    expect(coverTone(6)).toBe("d");
  });

  it("7..20 days is watch (w)", () => {
    expect(coverTone(7)).toBe("w");
    expect(coverTone(20)).toBe("w");
  });

  it(">= 21 days is safe (s)", () => {
    expect(coverTone(21)).toBe("s");
    expect(coverTone(120)).toBe("s");
  });
});
