import { describe, it, expect } from "vitest";
import { resolveGovernorateForArea } from "./egypt-areas-greater-cairo";

describe("resolveGovernorateForArea", () => {
  it("corrects a Giza district commonly mistyped under Cairo", () => {
    expect(resolveGovernorateForArea("الدقي")).toBe("الجيزة");
    expect(resolveGovernorateForArea("المهندسين")).toBe("الجيزة");
    expect(resolveGovernorateForArea("الشيخ زايد")).toBe("الجيزة");
  });

  it("confirms a correct Cairo district instead of only correcting away from Cairo", () => {
    expect(resolveGovernorateForArea("مدينة نصر")).toBe("القاهرة");
    expect(resolveGovernorateForArea("المعادي")).toBe("القاهرة");
  });

  it("distinguishes شبرا (Cairo) from شبرا الخيمة (Qalyubia)", () => {
    expect(resolveGovernorateForArea("شبرا")).toBe("القاهرة");
    expect(resolveGovernorateForArea("شبرا الخيمة")).toBe("القليوبية");
  });

  it("matches despite hamza/alef spelling variants", () => {
    expect(resolveGovernorateForArea("امبابة")).toBe("الجيزة"); // إمبابة without hamza
  });

  it("returns null for an unrecognized area, leaving the manual pick untouched", () => {
    expect(resolveGovernorateForArea("منطقة غير معروفة تماما")).toBeNull();
    expect(resolveGovernorateForArea("أسوان")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(resolveGovernorateForArea("")).toBeNull();
    expect(resolveGovernorateForArea(null)).toBeNull();
    expect(resolveGovernorateForArea(undefined)).toBeNull();
  });
});
