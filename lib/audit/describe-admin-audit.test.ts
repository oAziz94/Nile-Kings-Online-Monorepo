import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describeAdminAudit } from "./describe-admin-audit";
import { ACTION_LABELS } from "./action-labels";

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

  describe("backlog 9.7 additions", () => {
    it("describes an order assignment", () => {
      const sentence = describeAdminAudit({
        action: "assign",
        entityType: "order",
        entityLabel: "#NK-10479",
        before: { partnerId: null },
        after: { partnerId: "p1" },
      });
      expect(sentence).toBe("أسند الطلب #NK-10479");
    });

    it("describes an order reassignment", () => {
      const sentence = describeAdminAudit({
        action: "reassign",
        entityType: "order",
        entityLabel: "#NK-10479",
        before: { partnerId: "p1" },
        after: { partnerId: "p2" },
      });
      expect(sentence).toBe("أعاد إسناد الطلب #NK-10479");
    });

    it("describes a mirrored partner order status change", () => {
      const sentence = describeAdminAudit({
        action: "status_change",
        entityType: "order",
        entityLabel: "#NK-10480",
        before: { status: "CREATED" },
        after: { status: "CONFIRMED" },
      });
      expect(sentence).toBe("غيّر حالة الطلب #NK-10480 بانتظار التأكيد → مؤكد");
    });

    it("describes a receipt creation", () => {
      const sentence = describeAdminAudit({
        action: "create",
        entityType: "receipt",
        entityLabel: "R-2041",
        before: null,
        after: null,
      });
      expect(sentence).toBe("أنشأ الإيصال R-2041");
    });

    it("describes a partner_request status change", () => {
      const sentence = describeAdminAudit({
        action: "update",
        entityType: "partner_request",
        entityLabel: "سلمى فهمي",
        before: { status: "PENDING" },
        after: { status: "APPROVED" },
      });
      expect(sentence).toBe("غيّر حالة طلب الشريك سلمى فهمي بانتظار المراجعة → مقبول");
    });

    it("describes a ticket reply, close and reopen", () => {
      expect(
        describeAdminAudit({ action: "ticket_reply", entityType: "order", entityLabel: "#NK-1", before: null, after: null })
      ).toBe("رد على سؤال العميل في الطلب #NK-1");
      expect(
        describeAdminAudit({ action: "ticket_close", entityType: "order", entityLabel: "#NK-1", before: null, after: null })
      ).toBe("أغلق سؤال العميل في الطلب #NK-1");
      expect(
        describeAdminAudit({ action: "ticket_reopen", entityType: "order", entityLabel: "#NK-1", before: null, after: null })
      ).toBe("أعاد فتح سؤال العميل في الطلب #NK-1");
    });

    it("describes a proof-of-delivery upload", () => {
      const sentence = describeAdminAudit({
        action: "proof_of_delivery",
        entityType: "order",
        entityLabel: "#NK-1",
        before: null,
        after: null,
      });
      expect(sentence).toBe("رفع إثبات تسليم الطلب #NK-1");
    });

    it("describes a restock-request fulfilment", () => {
      const sentence = describeAdminAudit({
        action: "update",
        entityType: "restock_request",
        entityLabel: "#RR-0001",
        before: { status: "PENDING" },
        after: { status: "FULFILLED" },
      });
      expect(sentence).toBe("نفّذ نقل المخزون لطلب إعادة التوريد #RR-0001");
    });

    it("describes a partner-inventory manual adjustment", () => {
      const sentence = describeAdminAudit({
        action: "update",
        entityType: "partner-inventory",
        entityLabel: "3030-01-L-BLK",
        before: { stockAvailable: 10 },
        after: { stockAvailable: 25 },
      });
      expect(sentence).toBe("غيّر المخزون المتاح ل3030-01-L-BLK 10 → 25");
    });
  });

  it("ACTION_LABELS (backlog 9.7 review fix) covers every real action this file exercises", () => {
    // Derived from this file's own source rather than a hand-kept list, so a future test
    // case added here without a matching ACTION_LABELS entry fails immediately. "sync" is
    // the deliberate fallback-test action (an unrecognised action, never actually written)
    // and is excluded on purpose.
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const actions = new Set(
      [...source.matchAll(/action:\s*"([a-z_]+)"/g)].map((m) => m[1]).filter((a) => a !== "sync")
    );
    expect(actions.size).toBeGreaterThan(10);
    for (const action of actions) {
      expect(ACTION_LABELS, `no ACTION_LABELS entry for "${action}"`).toHaveProperty(action);
    }
  });
});
