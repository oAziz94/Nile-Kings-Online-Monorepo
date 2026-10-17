import { describe, expect, it } from "vitest";
import { isOnlinePartner, ONLINE_INVENTORY_WHERE, ONLINE_PARTNER_WHERE } from "./channel";

describe("partner channel", () => {
  it("treats only AGENT as online", () => {
    expect(isOnlinePartner({ partnerType: "AGENT" })).toBe(true);
    expect(isOnlinePartner({ partnerType: "DISTRIBUTOR" })).toBe(false);
  });
  it("exposes the where fragments", () => {
    expect(ONLINE_PARTNER_WHERE).toEqual({ partnerType: "AGENT" });
    expect(ONLINE_INVENTORY_WHERE).toEqual({ partner: { partnerType: "AGENT" } });
  });
});
