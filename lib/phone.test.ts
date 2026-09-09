import { describe, expect, it } from "vitest";
import { normalizeEgyptMobilePhone } from "@/lib/phone";

describe("normalizeEgyptMobilePhone", () => {
  it.each([
    ["01012345678", "+201012345678"],
    ["01112345678", "+201112345678"],
    ["01212345678", "+201212345678"],
    ["01512345678", "+201512345678"],
    ["1012345678", "+201012345678"],
    ["+201112345678", "+201112345678"],
    ["20 12 1234 5678", "+201212345678"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeEgyptMobilePhone(input)).toBe(expected);
  });

  it.each(["01312345678", "01412345678", "01612345678", "0123456789", "201312345678", "abc"])(
    "rejects %s",
    (input) => {
      expect(normalizeEgyptMobilePhone(input)).toBeNull();
    }
  );
});
