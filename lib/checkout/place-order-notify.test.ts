/**
 * Unit test for `placeOrder`'s `order.created` write point (backlog 10.34 c/f) — fires exactly
 * once, to every admin, on every successful order (customer checkout and admin-created orders
 * alike — no actor exclusion). Everything besides notification bookkeeping (summary math, stock
 * reservation, coupon usage) is mocked out — those have their own coverage elsewhere (the
 * public-checkout e2e spec, `lib/inventory/partner-inventory.test.ts`); this file only proves
 * the notify call site.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const summary = {
  subtotal: 10000,
  couponDiscount: 0,
  seniorFreeValue: 0,
  shippingFee: 2000,
  carrierShippingFee: 1500,
  codFee: 0,
  finalTotal: 12000,
  appliedCouponCode: null,
  shippingProvider: "Egypt Post",
};

vi.mock("./summary", () => ({
  buildCheckoutSummary: vi.fn(async () => summary),
  buildCheckoutSummaryFromLines: vi.fn(async () => summary),
}));

vi.mock("@/lib/inventory/partner-inventory", () => ({
  reservePartnerStockForOrder: vi.fn(async () => {}),
  commitPartnerReservation: vi.fn(async () => {}),
  findFulfillablePartnerForGovernorate: vi.fn(async () => ({
    ok: true,
    partnerId: "partner_1",
    ruleId: "rule_1",
    sequence: 1,
    originGovernorate: "القاهرة",
  })),
  InsufficientPartnerStockError: class InsufficientPartnerStockError extends Error {},
}));

vi.mock("@/lib/audit/order-audit", () => ({
  logOrderCreated: vi.fn(async () => {}),
  logOrderConfirmed: vi.fn(async () => {}),
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
  notifications: NotificationRow[] = [];
  admins: { id: string }[] = [{ id: "admin_1" }, { id: "admin_2" }];

  order = {
    create: async () => ({ id: "order_1", status: "CREATED" }),
  };
  orderItem = { createMany: async () => ({ count: 1 }) };
  paymentAttempt = { create: async () => ({}) };
  coupon = { findFirst: async () => null };
  couponUsage = { create: async () => ({}) };
  cartItem = { deleteMany: async () => ({ count: 0 }) };
  user = {
    findMany: async () => this.admins,
  };
  notification = {
    createMany: async ({ data }: { data: NotificationRow[] }) => {
      this.notifications.push(...data);
      return { count: data.length };
    },
  };
}

let fakeTx: FakeTx;

vi.mock("@/lib/db", () => ({
  prisma: {
    variant: {
      findMany: vi.fn(async () => [
        {
          id: "variant_1",
          sku: "SKU-1",
          name: "M",
          colorName: null,
          pricePiastres: 10000,
          product: { name: "منتج اختبار", slug: "test-product", active: true },
        },
      ]),
    },
    $transaction: async (fn: (tx: FakeTx) => Promise<unknown>) => fn(fakeTx),
  },
}));

beforeEach(() => {
  fakeTx = new FakeTx();
});

describe("placeOrder — order.created notification", () => {
  it("notifies every admin, once, with the governorate and formatted total in the title", async () => {
    const { placeOrder } = await import("./place-order");

    const result = await placeOrder({
      userId: "customer_1",
      address: {
        governorate: "القاهرة",
        city: "مدينة نصر",
        area: "الحي السابع",
        street: "شارع الاختبار",
        phone: "01000000000",
      },
      paymentMethod: "COD",
      lines: [{ variantId: "variant_1", quantity: 1 }],
    });

    expect(result.success).toBe(true);
    expect(fakeTx.notifications).toHaveLength(2);
    expect(fakeTx.notifications.map((n) => n.userId).sort()).toEqual(["admin_1", "admin_2"]);
    for (const row of fakeTx.notifications) {
      expect(row.kind).toBe("order.created");
      expect(row.href).toBe("/admin/orders/order_1");
      expect(row.title).toContain("القاهرة");
      expect(row.title).toContain("120"); // finalTotal 12000 piastres -> 120 ج.م
    }
  });
});
