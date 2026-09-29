/**
 * Unit test for `notifyOrderAssigned` (backlog 10.38) — the shared "order.assigned" write
 * point called from `place-order.ts`, `assign-partner.ts` and `rerouting/assign.ts`.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { notifyOrderAssigned } from "./events";

type NotificationRow = {
  userId: string;
  kind: string;
  title: string;
  href: string;
  entityType: string | null;
  entityId: string | null;
};

class FakeTx {
  notifications: NotificationRow[] = [];
  partners: Record<string, { userId: string | null }> = {};

  partner = {
    findUnique: async ({ where }: { where: { id: string } }) => this.partners[where.id] ?? null,
  };
  notification = {
    createMany: async ({ data }: { data: NotificationRow[] }) => {
      this.notifications.push(...data);
      return { count: data.length };
    },
  };
}

let tx: FakeTx;

beforeEach(() => {
  tx = new FakeTx();
});

describe("notifyOrderAssigned", () => {
  it("writes one order.assigned row to the partner's user with the expected title/href", async () => {
    tx.partners["partner_1"] = { userId: "user_1" };

    await notifyOrderAssigned(tx as never, {
      orderId: "order_123",
      partnerId: "partner_1",
      shortId: "order_12",
      area: "المعادي",
      itemCount: 4,
    });

    expect(tx.notifications).toHaveLength(1);
    expect(tx.notifications[0]).toMatchObject({
      userId: "user_1",
      kind: "order.assigned",
      href: "/partner/orders/order_123",
      entityType: "order",
      entityId: "order_123",
    });
    expect(tx.notifications[0].title).toBe("طلب جديد #order_12 · المعادي · 4 قطع");
  });

  it("skips (no query error, no row) when the partner has no linked user", async () => {
    tx.partners["partner_1"] = { userId: null };

    await notifyOrderAssigned(tx as never, {
      orderId: "order_123",
      partnerId: "partner_1",
      shortId: "order_12",
      area: "المعادي",
      itemCount: 4,
    });

    expect(tx.notifications).toHaveLength(0);
  });

  it("skips when the partner id resolves to no partner row", async () => {
    await notifyOrderAssigned(tx as never, {
      orderId: "order_123",
      partnerId: "does_not_exist",
      shortId: "order_12",
      area: "المعادي",
      itemCount: 4,
    });

    expect(tx.notifications).toHaveLength(0);
  });
});
