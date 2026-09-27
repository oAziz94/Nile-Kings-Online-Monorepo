/**
 * Unit test for `assignOrderToPartner`'s `order.assigned` write point (backlog 10.34 c/f) —
 * fires exactly once, to the newly-assigned partner's user, on both the first-time "assign"
 * branch and the "reassign" branch. Everything besides notification bookkeeping (stock
 * reservation, routed-order rows, the two audit trails) is mocked out — those are covered by
 * `assign-partner.test.ts`'s pure-function tests and the e2e suite; this file only proves the
 * notify call site.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inventory/partner-inventory", () => ({
  reservePartnerStockForOrder: vi.fn(async () => {}),
  commitPartnerReservation: vi.fn(async () => {}),
  reassignReservedPartnerStock: vi.fn(async () => {}),
  orderUsesPartnerReservationOnly: (status: string) => status === "CREATED",
  InsufficientPartnerStockError: class InsufficientPartnerStockError extends Error {},
}));

vi.mock("@/lib/audit/order-audit", () => ({
  logOrderPartnerAssigned: vi.fn(async () => {}),
}));

vi.mock("@/lib/audit/admin-audit", () => ({
  logAdminAction: vi.fn(async () => {}),
}));

type NotificationRow = {
  userId: string;
  kind: string;
  title: string;
  href: string;
  entityType: string | null;
  entityId: string | null;
};

class FakeTx {
  orders: Record<string, unknown> = {};
  partners: Record<string, { id: string; governorate: string; isActive: boolean; userId: string | null }> = {};
  notifications: NotificationRow[] = [];

  order = {
    findUnique: async ({ where }: { where: { id: string } }) => (this.orders[where.id] as never) ?? null,
    update: async ({ where }: { where: { id: string } }) => this.orders[where.id],
  };
  partner = {
    findUnique: async ({ where }: { where: { id: string } }) => this.partners[where.id] ?? null,
  };
  routedOrder = {
    create: async () => ({ id: "routed_1" }),
    update: async () => ({ id: "routed_1" }),
  };
  user = {
    findMany: async () => [],
  };
  notification = {
    createMany: async ({ data }: { data: NotificationRow[] }) => {
      this.notifications.push(...data);
      return { count: data.length };
    },
  };
  $executeRaw = async () => 1;
}

const ORDER_ID = "order_1";
const NEW_PARTNER = "partner_new";

let tx: FakeTx;

beforeEach(() => {
  tx = new FakeTx();
});

describe("assignOrderToPartner — order.assigned notification", () => {
  it("first-time assign: notifies the new partner's user exactly once", async () => {
    const { assignOrderToPartner } = await import("./assign-partner");
    tx.orders[ORDER_ID] = {
      id: ORDER_ID,
      status: "CREATED",
      assignedPartnerId: null,
      shippingAddress: { area: "الحي السابع" },
      items: [{ variantId: "v1", quantity: 2 }],
      routedOrder: null,
    };
    tx.partners[NEW_PARTNER] = { id: NEW_PARTNER, governorate: "القاهرة", isActive: true, userId: "partner_user_1" };

    await assignOrderToPartner(tx as never, {
      orderId: ORDER_ID,
      partnerId: NEW_PARTNER,
      actor: { userId: "admin_1", phone: "+201000000000", role: "ADMIN" },
    });

    expect(tx.notifications).toHaveLength(1);
    expect(tx.notifications[0]).toMatchObject({
      userId: "partner_user_1",
      kind: "order.assigned",
      href: `/partner/orders/${ORDER_ID}`,
    });
    expect(tx.notifications[0].title).toContain("الحي السابع");
    expect(tx.notifications[0].title).toContain("2 قطع");
  });

  it("reassign: notifies the newly-assigned partner's user, not the old one", async () => {
    const { assignOrderToPartner } = await import("./assign-partner");
    tx.orders[ORDER_ID] = {
      id: ORDER_ID,
      status: "CREATED",
      assignedPartnerId: "partner_old",
      shippingAddress: { area: "المعادي" },
      items: [{ variantId: "v1", quantity: 1 }],
      routedOrder: { id: "routed_1", notes: null },
    };
    tx.partners[NEW_PARTNER] = { id: NEW_PARTNER, governorate: "القاهرة", isActive: true, userId: "partner_user_2" };

    await assignOrderToPartner(tx as never, {
      orderId: ORDER_ID,
      partnerId: NEW_PARTNER,
      actor: { userId: "admin_1", phone: "+201000000000", role: "ADMIN" },
    });

    expect(tx.notifications).toHaveLength(1);
    expect(tx.notifications[0].userId).toBe("partner_user_2");
  });

  it("skips notifying when the assigned partner has no linked user", async () => {
    const { assignOrderToPartner } = await import("./assign-partner");
    tx.orders[ORDER_ID] = {
      id: ORDER_ID,
      status: "CREATED",
      assignedPartnerId: null,
      shippingAddress: { area: "الحي السابع" },
      items: [{ variantId: "v1", quantity: 2 }],
      routedOrder: null,
    };
    tx.partners[NEW_PARTNER] = { id: NEW_PARTNER, governorate: "القاهرة", isActive: true, userId: null };

    await assignOrderToPartner(tx as never, {
      orderId: ORDER_ID,
      partnerId: NEW_PARTNER,
      actor: { userId: "admin_1", phone: "+201000000000", role: "ADMIN" },
    });

    expect(tx.notifications).toHaveLength(0);
  });
});
