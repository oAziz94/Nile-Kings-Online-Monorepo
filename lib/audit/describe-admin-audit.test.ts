import { describe, expect, it } from "vitest";
import { describeAdminAudit } from "./describe-admin-audit";

describe("describeAdminAudit", () => {
  it("describes a partner cost-rate change in the canvas's own sentence shape", () => {
    const sentence = describeAdminAudit({
      action: "update",
      entityType: "partner",
      entityLabel: "موزع القليوبية",
      before: { costRateBps: 7500 },
      after: { costRateBps: 7000 },
    });
    expect(sentence).toBe("غيّر نسبة الشراء لموزع القليوبية 75% → 70%");
  });

  it("describes a coupon creation", () => {
    const sentence = describeAdminAudit({
      action: "create",
      entityType: "coupon",
      entityLabel: "RAMADAN",
      before: null,
      after: null,
    });
    expect(sentence).toBe("أنشأ الكوبون RAMADAN");
  });

  it("describes revoking admin access", () => {
    const sentence = describeAdminAudit({
      action: "revoke_admin",
      entityType: "user",
      entityLabel: "01001234567",
      before: null,
      after: null,
    });
    expect(sentence).toBe("أزال صلاحية المسؤول 01001234567");
  });

  it("describes granting admin access", () => {
    const sentence = describeAdminAudit({
      action: "grant_admin",
      entityType: "user",
      entityLabel: "01001234567",
      before: null,
      after: null,
    });
    expect(sentence).toBe("منح صلاحية المسؤول لـ01001234567");
  });

  it("falls back to a generic sentence for an unrecognised action/field", () => {
    const sentence = describeAdminAudit({
      action: "sync",
      entityType: "media",
      entityLabel: "3030-01",
      before: null,
      after: null,
    });
    expect(sentence).toBe("عدّل media 3030-01");
  });
});
