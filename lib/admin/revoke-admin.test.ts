import { describe, expect, it } from "vitest";
import { canRevokeAdmin } from "@/lib/admin/revoke-admin";

describe("canRevokeAdmin", () => {
  it("refuses to demote the caller themselves, even with other admins around", () => {
    expect(canRevokeAdmin({ targetId: "a", callerId: "a", adminCount: 5 })).toEqual({
      allowed: false,
      reason: "SELF",
    });
  });

  it("refuses to demote the caller themselves when they are also the last admin", () => {
    expect(canRevokeAdmin({ targetId: "a", callerId: "a", adminCount: 1 })).toEqual({
      allowed: false,
      reason: "SELF",
    });
  });

  it("refuses to demote the last remaining admin, even by a different caller", () => {
    expect(canRevokeAdmin({ targetId: "b", callerId: "a", adminCount: 1 })).toEqual({
      allowed: false,
      reason: "LAST_ADMIN",
    });
  });

  it("allows demoting another admin when at least one other admin remains", () => {
    expect(canRevokeAdmin({ targetId: "b", callerId: "a", adminCount: 2 })).toEqual({
      allowed: true,
    });
  });

  it("allows demoting another admin with several admins remaining", () => {
    expect(canRevokeAdmin({ targetId: "b", callerId: "a", adminCount: 5 })).toEqual({
      allowed: true,
    });
  });
});
