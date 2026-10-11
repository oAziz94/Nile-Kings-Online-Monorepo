import { describe, it, expect } from "vitest";
import {
  canonicalGovernorate,
  isLocationMismatch,
  locationMismatchWarning,
  LOCATION_MISMATCH_CODE,
} from "./location-mismatch";

describe("location mismatch (backlog 10.49)", () => {
  it("canonicalises governorate values and trims", () => {
    expect(canonicalGovernorate(" القاهرة ")).toBe("القاهرة");
    expect(canonicalGovernorate("غير موجودة")).toBeNull();
    expect(canonicalGovernorate(null)).toBeNull();
  });

  it("is not a mismatch when governorates agree", () => {
    expect(isLocationMismatch("القاهرة", "القاهرة")).toBe(false);
    expect(isLocationMismatch(" القاهرة", "القاهرة ")).toBe(false);
  });

  it("is a mismatch when governorates differ", () => {
    expect(isLocationMismatch("كفر الشيخ", "القاهرة")).toBe(true);
  });

  it("treats an unrecognised address governorate as a mismatch", () => {
    expect(isLocationMismatch("مدينة وهمية", "القاهرة")).toBe(true);
    expect(isLocationMismatch("", "القاهرة")).toBe(true);
  });

  it("does not flag when there is no storefront governorate (handled by GOVERNORATE_NOT_SELECTED)", () => {
    expect(isLocationMismatch("كفر الشيخ", null)).toBe(false);
  });

  it("builds the spec warning copy", () => {
    expect(locationMismatchWarning("كفر الشيخ", "القاهرة")).toBe(
      "عنوان التوصيل في كفر الشيخ بينما المتجر يعرض مخزون القاهرة — سنحوّل طلبك لوكيل كفر الشيخ"
    );
    expect(LOCATION_MISMATCH_CODE).toBe("LOCATION_MISMATCH");
  });
});
