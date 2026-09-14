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

  // Backlog 9.5 close-out fix — the six التوجيه/مخزون الشبكة actions each get a dedicated
  // Arabic sentence (previously fell through to the generic branch, mixing the English
  // action/entityType into the sentence: "عدّل routing القليوبية").
  describe("9.5 routing/stock-correction actions", () => {
    it("add_partner", () => {
      const sentence = describeAdminAudit({
        action: "add_partner",
        entityType: "routing",
        entityLabel: "القليوبية",
        before: null,
        after: { partnerId: "p1", partnerName: "وكيل القاهرة" },
      });
      expect(sentence).toBe("أضاف وكيل القاهرة إلى دور القليوبية");
    });

    it("remove_partner", () => {
      const sentence = describeAdminAudit({
        action: "remove_partner",
        entityType: "routing",
        entityLabel: "القليوبية",
        before: { partnerId: "p1", partnerName: "وكيل القاهرة" },
        after: null,
      });
      expect(sentence).toBe("أزال وكيل القاهرة من دور القليوبية");
    });

    it("pause_partner", () => {
      const sentence = describeAdminAudit({
        action: "pause_partner",
        entityType: "routing",
        entityLabel: "القليوبية",
        before: null,
        after: { partnerId: "p2", partnerName: "موزع القليوبية", isActive: false },
      });
      expect(sentence).toBe("أوقف موزع القليوبية مؤقتًا في القليوبية");
    });

    it("resume_partner", () => {
      const sentence = describeAdminAudit({
        action: "resume_partner",
        entityType: "routing",
        entityLabel: "القليوبية",
        before: null,
        after: { partnerId: "p2", partnerName: "موزع القليوبية", isActive: true },
      });
      expect(sentence).toBe("أعاد تفعيل موزع القليوبية في القليوبية");
    });

    it("set_mode to manual", () => {
      const sentence = describeAdminAudit({
        action: "set_mode",
        entityType: "routing",
        entityLabel: "القليوبية",
        before: { isActive: true },
        after: { isActive: false },
      });
      expect(sentence).toBe("حوّل القليوبية إلى الإسناد اليدوي");
    });

    it("set_mode to automatic", () => {
      const sentence = describeAdminAudit({
        action: "set_mode",
        entityType: "routing",
        entityLabel: "القليوبية",
        before: { isActive: false },
        after: { isActive: true },
      });
      expect(sentence).toBe("حوّل القليوبية إلى التوجيه التلقائي");
    });

    it("stock_correction", () => {
      const sentence = describeAdminAudit({
        action: "stock_correction",
        entityType: "partner-inventory",
        entityLabel: "3030-01-L-BLK",
        before: { stockAvailable: 2 },
        after: { partnerName: "وكيل القاهرة", stockAvailable: 7 },
      });
      expect(sentence).toBe("صحّح مخزون 3030-01-L-BLK عند وكيل القاهرة 2 → 7");
    });
  });

  it("falls back to the routing entity label for an unrecognised routing action", () => {
    const sentence = describeAdminAudit({
      action: "sync",
      entityType: "routing",
      entityLabel: "القليوبية",
      before: null,
      after: null,
    });
    expect(sentence).toBe("عدّل التوجيه القليوبية");
  });

  it("falls back to the مخزون الشريك entity label for an unrecognised partner-inventory action", () => {
    const sentence = describeAdminAudit({
      action: "sync",
      entityType: "partner-inventory",
      entityLabel: "3030-01-L-BLK",
      before: null,
      after: null,
    });
    expect(sentence).toBe("عدّل مخزون الشريك 3030-01-L-BLK");
  });
});
