import { describe, expect, it } from "vitest";
import { normalizeAccountPhone, normalizeEgyptMobilePhone } from "@/lib/phone";

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

describe("normalizeAccountPhone", () => {
  it.each([
    ["+201012345678", "+201012345678"], // Egypt
    ["+966512345678", "+966512345678"], // Saudi Arabia
    ["+971501234567", "+971501234567"], // UAE
    ["+905321234567", "+905321234567"], // Turkey
    ["+14155552671", "+14155552671"], // US (NANP, +1)
    ["+15145551234", "+15145551234"], // Canada — shares +1 with the dropdown's "US/Canada" entry
    ["+447911123456", "+447911123456"], // UK dropdown entry (may resolve to a Crown-dependency ISO)
    ["+33612345678", "+33612345678"], // France
    ["+4915123456789", "+4915123456789"], // Germany
  ])("accepts %s for its own dropdown calling code", (input, expected) => {
    expect(normalizeAccountPhone(input)).toBe(expected);
  });

  it.each([
    "+201312345678", // Egypt non-mobile prefix (013)
    "+96650123456", // Saudi number, wrong length
    "+966201012345678", // Egyptian-shaped digits stuffed under the Saudi calling code
    "+9999999999", // unknown/unsupported calling code
    "notaphone",
    "",
  ])("rejects %s", (input) => {
    expect(normalizeAccountPhone(input)).toBeNull();
  });
});
