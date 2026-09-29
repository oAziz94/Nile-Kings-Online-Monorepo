/**
 * Unit test for `assignOrderToGovernorate`'s notification behaviour (backlog 10.38):
 * - the "order already has an assignedPartnerId" branch (place-order already picked and locked
 *   the partner) must NOT notify again — place-order notified in its own transaction already.
 * - the rule-based round-robin branch, which is the one that assigns a partner to an order
 *   that had none, must notify that partner exactly once, and only when it actually creates
 *   the `RoutedOrder` (not on the idempotent "already routed" early return).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  routedOrders: Record<string, { id: string; partnerId: string | null }> = {};

  partner = {
    findUnique: async ({ where }: { where: { id: string } }) => this.partners[where.id] ?? null,
  };
  routedOrder = {
    findUnique: async ({ where }: { where: { orderId: string } }) => this.routedOrders[where.orderId] ?? null,
    create: async ({ data }: { data: { orderId: string; partnerId?: string | null } }) => {
      const created = { id: `routed_${data.orderId}`, partnerId: data.partnerId ?? null };
      this.routedOrders[data.orderId] = created;
      return created;
    },
  };
  reroutingRule = {
    update: async () => ({}),
  };
  notification = {
    createMany: async ({ data }: { data: NotificationRow[] }) => {
      this.notifications.push(...data);
      return { count: data.length };
    },
  };
}

let fakeTx: FakeTx;
let orders: Record<string, unknown>;
let rules: Record<string, unknown>;

vi.mock("@/lib/db", () => ({
  prisma: {
    order: {
      findUnique: async ({ where }: { where: { id: string } }) => orders[where.id] ?? null,
    },
    reroutingRule: {
      findFirst: async () => Object.values(rules)[0] ?? null,
    },
    routedOrder: {
      create: async (args: { data: { orderId: string; partnerId?: string | null; status: string } }) => {
        const created = { id: `routed_${args.data.orderId}`, partnerId: args.data.partnerId ?? null };
        return created;
      },
    },
    $transaction: async (fn: (tx: FakeTx) => Promise<unknown>) => fn(fakeTx),
  },
}));

beforeEach(() => {
  fakeTx = new FakeTx();
  orders = {};
  rules = {};
});

describe("assignOrderToGovernorate — order.assigned notification", () => {
  it("does not notify when the order already has an assignedPartnerId (place-order already did)", async () => {
    const { assignOrderToGovernorate } = await import("./assign");
    orders["order_1"] = {
      id: "order_1",
      assignedPartnerId: "partner_1",
      assignedPartner: { id: "partner_1" },
      shippingAddress: { governorate: "القاهرة" },
      items: [{ quantity: 2 }],
    };
    fakeTx.partners["partner_1"] = { userId: "user_1" };

    const result = await assignOrderToGovernorate("order_1");

    expect(result.assigned).toBe(true);
    expect(fakeTx.notifications).toHaveLength(0);
  });

  it("notifies the round-robin selected partner when the order had none assigned", async () => {
    const { assignOrderToGovernorate } = await import("./assign");
    orders["order_2"] = {
      id: "order_2",
      assignedPartnerId: null,
      assignedPartner: null,
      shippingAddress: { governorate: "الجيزة", area: "الدقي" },
      items: [{ quantity: 1 }, { quantity: 2 }],
    };
    rules["rule_1"] = {
      id: "rule_1",
      lastAssignedPartnerId: null,
      partners: [{ partnerId: "partner_2" }],
    };
    fakeTx.partners["partner_2"] = { userId: "user_2" };

    const result = await assignOrderToGovernorate("order_2");

    expect(result).toMatchObject({ assigned: true, partnerId: "partner_2" });
    expect(fakeTx.notifications).toHaveLength(1);
    expect(fakeTx.notifications[0]).toMatchObject({
      userId: "user_2",
      kind: "order.assigned",
      href: "/partner/orders/order_2",
    });
    expect(fakeTx.notifications[0].title).toContain("الدقي");
    expect(fakeTx.notifications[0].title).toContain("3 قطع");
  });
});
