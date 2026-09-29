/**
 * Unit test for `placeOrder`'s `order.created` (admins) and `order.assigned` (backlog 10.38,
 * the fulfilling partner picked by `findFulfillablePartnerForGovernorate`) write points — both
 * fire exactly once, on every successful order (customer checkout and admin-created orders
 * alike — no actor exclusion). Everything besides notification bookkeeping (summary math, stock
 * reservation, coupon usage) is mocked out — those have their own coverage elsewhere (the
 * public-checkout e2e spec, `lib/inventory/partner-inventory.test.ts`); this file only proves
 * the notify call sites.
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
  partnerUserId: string | null = "partner_user_1";

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
  partner = {
    findUnique: async () => (this.partnerUserId ? { userId: this.partnerUserId } : { userId: null }),
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

const baseInput = {
  userId: "customer_1",
  address: {
    governorate: "القاهرة",
    city: "مدينة نصر",
    area: "الحي السابع",
    street: "شارع الاختبار",
    phone: "01000000000",
  },
  paymentMethod: "COD" as const,
  lines: [{ variantId: "variant_1", quantity: 3 }],
};

describe("placeOrder — order.created notification", () => {
  it("notifies every admin, once, with the governorate and formatted total in the title", async () => {
    const { placeOrder } = await import("./place-order");

    const result = await placeOrder(baseInput);

    expect(result.success).toBe(true);
    const adminRows = fakeTx.notifications.filter((n) => n.kind === "order.created");
    expect(adminRows).toHaveLength(2);
    expect(adminRows.map((n) => n.userId).sort()).toEqual(["admin_1", "admin_2"]);
    for (const row of adminRows) {
      expect(row.href).toBe("/admin/orders/order_1");
      expect(row.title).toContain("القاهرة");
      expect(row.title).toContain("120"); // finalTotal 12000 piastres -> 120 ج.م
    }
  });
});

describe("placeOrder — order.assigned notification (backlog 10.38)", () => {
  it("notifies the fulfilling partner's user, once, with area and piece count", async () => {
    const { placeOrder } = await import("./place-order");

    const result = await placeOrder(baseInput);

    expect(result.success).toBe(true);
    const partnerRows = fakeTx.notifications.filter((n) => n.kind === "order.assigned");
    expect(partnerRows).toHaveLength(1);
    expect(partnerRows[0]).toMatchObject({
      userId: "partner_user_1",
      href: "/partner/orders/order_1",
    });
    expect(partnerRows[0].title).toContain("الحي السابع");
    expect(partnerRows[0].title).toContain("3 قطع");
  });

  it("skips the partner notification when the partner has no linked user", async () => {
    fakeTx.partnerUserId = null;
    const { placeOrder } = await import("./place-order");

    const result = await placeOrder(baseInput);

    expect(result.success).toBe(true);
    expect(fakeTx.notifications.some((n) => n.kind === "order.assigned")).toBe(false);
    // admins are still notified — the partner having no user must not skip the admin write.
    expect(fakeTx.notifications.filter((n) => n.kind === "order.created")).toHaveLength(2);
  });
});
