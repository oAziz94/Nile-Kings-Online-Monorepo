import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECEIPT_FOOTER,
  receiptFooterSchema,
  storeAddressSchema,
  storeNameSchema,
  validateSettingsFieldsForType,
} from "./settings-schema";
import { AGENT_ONLY_ROUTE_PREFIXES, getPartnerNavForRole, getPartnerMobileTabs, isAgentOnlyRoute } from "../../components/partner/partner-nav-config";

describe("validateSettingsFieldsForType", () => {
  it("rejects each outlet-only field from an AGENT", () => {
    for (const field of ["storeName", "storeAddress", "receiptFooter"]) {
      expect(validateSettingsFieldsForType("AGENT", { [field]: "x" })).toBeTruthy();
    }
  });
  it("accepts the three fields from a DISTRIBUTOR and anything else from an AGENT", () => {
    expect(validateSettingsFieldsForType("DISTRIBUTOR", { storeName: "a", storeAddress: "b", receiptFooter: "c" })).toBeNull();
    expect(validateSettingsFieldsForType("AGENT", { lowStockThreshold: 3, workingDays: ["SAT"] })).toBeNull();
  });
});

describe("store profile bounds", () => {
  it("trims, and maps empty to null", () => {
    expect(storeNameSchema.parse("  منفذ النيل ")).toBe("منفذ النيل");
    expect(storeAddressSchema.parse("   ")).toBeNull();
    expect(receiptFooterSchema.parse("")).toBeNull();
  });
  it("enforces max lengths", () => {
    expect(storeNameSchema.safeParse("x".repeat(81)).success).toBe(false);
    expect(storeAddressSchema.safeParse("x".repeat(201)).success).toBe(false);
    expect(receiptFooterSchema.safeParse("x".repeat(201)).success).toBe(false);
  });
  it("exposes the default receipt footer", () => {
    expect(DEFAULT_RECEIPT_FOOTER).toBe("شكراً لتسوقكم من قطن ملوك النيل");
  });
});

describe("outlet navigation", () => {
  it("DISTRIBUTOR menu is اليوم · المبيعات · المخزون · التقارير only", () => {
    const labels = getPartnerNavForRole("DISTRIBUTOR").flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual(["اليوم", "المبيعات", "المخزون", "التقارير"]);
    expect(getPartnerMobileTabs("DISTRIBUTOR").map((t) => t.label)).toEqual(["اليوم", "المبيعات", "المخزون", "التقارير"]);
  });
  it("AGENT menu is unchanged", () => {
    const labels = getPartnerNavForRole("AGENT").flatMap((s) => s.items.map((i) => i.label));
    expect(labels).toEqual(["اليوم", "الطلبات", "المخزون", "الموزعون", "التقارير", "الإشعارات"]);
    expect(getPartnerMobileTabs("AGENT").map((t) => t.label)).toEqual(["اليوم", "الطلبات", "المخزون", "التقارير"]);
  });
  it("flags the agent-only routes segment-wise", () => {
    for (const p of AGENT_ONLY_ROUTE_PREFIXES) {
      expect(isAgentOnlyRoute(p)).toBe(true);
      expect(isAgentOnlyRoute(`${p}/abc`)).toBe(true);
    }
    expect(isAgentOnlyRoute("/partner/orders-x")).toBe(false);
    for (const ok of ["/partner", "/partner/sales", "/partner/stock", "/partner/reports/sales", "/partner/reports/inventory", "/partner/settings"]) {
      expect(isAgentOnlyRoute(ok)).toBe(false);
    }
  });
});
