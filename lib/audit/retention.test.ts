import { describe, expect, it } from "vitest";
import { AUDIT_RETENTION_KEPT_FOREVER_ENTITY_TYPES, isMoneyOrStockRow } from "./retention";

describe("isMoneyOrStockRow (backlog 9.7 (f) retention set)", () => {
  it("keeps receipt/payment/inventory rows forever regardless of action", () => {
    for (const entityType of AUDIT_RETENTION_KEPT_FOREVER_ENTITY_TYPES) {
      expect(isMoneyOrStockRow({ entityType, action: "create" })).toBe(true);
      expect(isMoneyOrStockRow({ entityType, action: "anything" })).toBe(true);
    }
  });

  it("keeps an order status_change row forever (money/stock via status)", () => {
    expect(isMoneyOrStockRow({ entityType: "order", action: "status_change" })).toBe(true);
  });

  it("keeps an order update row forever (admin PATCH before/after includes money/stock fields)", () => {
    expect(isMoneyOrStockRow({ entityType: "order", action: "update" })).toBe(true);
  });

  it("prunes an order assign/reassign/ticket/proof row (not money or stock)", () => {
    expect(isMoneyOrStockRow({ entityType: "order", action: "assign" })).toBe(false);
    expect(isMoneyOrStockRow({ entityType: "order", action: "reassign" })).toBe(false);
    expect(isMoneyOrStockRow({ entityType: "order", action: "ticket_reply" })).toBe(false);
    expect(isMoneyOrStockRow({ entityType: "order", action: "proof_of_delivery" })).toBe(false);
  });

  it("prunes coupon/partner/settings/user rows", () => {
    expect(isMoneyOrStockRow({ entityType: "coupon", action: "create" })).toBe(false);
    expect(isMoneyOrStockRow({ entityType: "partner", action: "update" })).toBe(false);
    expect(isMoneyOrStockRow({ entityType: "settings", action: "update" })).toBe(false);
    expect(isMoneyOrStockRow({ entityType: "user", action: "grant_admin" })).toBe(false);
  });
});
