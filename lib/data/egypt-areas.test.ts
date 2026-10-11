import { describe, it, expect } from "vitest";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import {
  AREA_HOMONYMS,
  EGYPT_AREAS,
  canonicalAreaName,
  correctGovernorateForArea,
  getAreasForGovernorate,
  isKnownAreaOf,
  normalizeAreaName,
  resolveGovernorateForArea,
} from "./egypt-areas";

describe("EGYPT_AREAS dataset (backlog 10.47)", () => {
  it("covers every governorate in GOVERNORATE_OPTIONS with at least 3 areas, and no extra keys", () => {
    const expected = GOVERNORATE_OPTIONS.map((o) => o.value).sort();
    expect(Object.keys(EGYPT_AREAS).sort()).toEqual(expected);
    for (const gov of expected) {
      expect(getAreasForGovernorate(gov).length, gov).toBeGreaterThanOrEqual(3);
    }
  });

  it("has no duplicate area inside one governorate (after normalisation)", () => {
    for (const [gov, areas] of Object.entries(EGYPT_AREAS)) {
      const keys = areas.map(normalizeAreaName);
      expect(new Set(keys).size, gov).toBe(keys.length);
    }
  });

  it("lists an area under two governorates only when it is a declared homonym", () => {
    const seen = new Map<string, string[]>();
    for (const [gov, areas] of Object.entries(EGYPT_AREAS)) {
      for (const area of areas) {
        const key = normalizeAreaName(area);
        seen.set(key, [...(seen.get(key) ?? []), gov]);
      }
    }
    const homonymKeys = new Set(AREA_HOMONYMS.map(normalizeAreaName));
    const undeclared = [...seen.entries()].filter(([key, govs]) => govs.length > 1 && !homonymKeys.has(key));
    expect(undeclared, JSON.stringify(undeclared)).toEqual([]);
    for (const h of AREA_HOMONYMS) {
      expect(seen.get(normalizeAreaName(h))?.length, h).toBeGreaterThan(1);
    }
  });
});

describe("normalizeAreaName", () => {
  it("folds hamza/taa marbuta/alef maqsura, digits and whitespace", () => {
    expect(normalizeAreaName("مدينه  نصر ")).toBe(normalizeAreaName("مدينة نصر"));
    expect(normalizeAreaName("المعادى")).toBe(normalizeAreaName("المعادي"));
    expect(normalizeAreaName("إمبابة")).toBe(normalizeAreaName("امبابه"));
    expect(normalizeAreaName("١٥ مايو")).toBe(normalizeAreaName("15 مايو"));
    expect(normalizeAreaName("الدَّقي")).toBe(normalizeAreaName("الدقي"));
  });
});

describe("resolveGovernorateForArea (nationwide silent correction)", () => {
  it("resolves well-known areas to their governorate", () => {
    expect(resolveGovernorateForArea("الدقي")).toBe("الجيزة");
    expect(resolveGovernorateForArea("مدينه نصر")).toBe("القاهرة");
    expect(resolveGovernorateForArea("بيلا")).toBe("كفر الشيخ");
    expect(resolveGovernorateForArea("المحلة")).toBe("الغربية");
    expect(resolveGovernorateForArea("شبرا الخيمة")).toBe("القليوبية");
    expect(resolveGovernorateForArea("٦ أكتوبر")).toBe("الجيزة");
    expect(resolveGovernorateForArea("شرم")).toBe("جنوب سيناء");
  });

  it("returns null for unknown areas and for homonyms", () => {
    expect(resolveGovernorateForArea("")).toBeNull();
    expect(resolveGovernorateForArea("قرية لا وجود لها")).toBeNull();
    expect(resolveGovernorateForArea("المطرية")).toBeNull();
    expect(resolveGovernorateForArea("دار السلام")).toBeNull();
  });
});

describe("canonicalAreaName / isKnownAreaOf", () => {
  it("returns the canonical label for aliases and variants", () => {
    expect(canonicalAreaName("مدينه نصر")).toBe("مدينة نصر");
    expect(canonicalAreaName("السادس من أكتوبر")).toBe("6 أكتوبر");
    expect(canonicalAreaName("راس البر")).toBe("رأس البر");
    expect(canonicalAreaName("nowhere")).toBeNull();
  });

  it("checks membership per governorate, including homonyms", () => {
    expect(isKnownAreaOf("كفر الشيخ", "بيلا")).toBe(true);
    expect(isKnownAreaOf("القاهرة", "بيلا")).toBe(false);
    expect(isKnownAreaOf("القاهرة", "المطرية")).toBe(true);
    expect(isKnownAreaOf("الدقهلية", "المطرية")).toBe(true);
  });
});

describe("correctGovernorateForArea (server-side correction, 10.48)", () => {
  it("overwrites the governorate when the area belongs to exactly one other governorate", () => {
    expect(correctGovernorateForArea("القاهرة", "الدقي")).toBe("الجيزة");
    expect(correctGovernorateForArea("القاهرة", "الدقى")).toBe("الجيزة");
    expect(correctGovernorateForArea("الإسكندرية", "بيلا")).toBe("كفر الشيخ");
  });

  it("leaves a matching, unknown or empty area untouched", () => {
    expect(correctGovernorateForArea("كفر الشيخ", "بيلا")).toBe("كفر الشيخ");
    expect(correctGovernorateForArea("القاهرة", "حي غير معروف")).toBe("القاهرة");
    expect(correctGovernorateForArea("القاهرة", "")).toBe("القاهرة");
    expect(correctGovernorateForArea("القاهرة", null)).toBe("القاهرة");
  });

  it("never corrects a homonym", () => {
    for (const area of AREA_HOMONYMS) {
      expect(correctGovernorateForArea("القاهرة", area)).toBe("القاهرة");
      expect(correctGovernorateForArea("الجيزة", area)).toBe("الجيزة");
    }
  });
});
