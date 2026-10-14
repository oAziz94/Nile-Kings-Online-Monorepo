/** Backlog 10.51: placeOrder's NO_PARTNER shortage mapping (admin vs public wording). */
import { describe, it, expect, vi } from "vitest";

let shortageResult: unknown = {
  ok: false,
  reason: "NO_PARTNER",
  shortages: [{ partnerId: "p1", partnerName: "شريك القاهرة", insufficientVariantIds: ["variant_1"] }],
};

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
  findFulfillablePartnerForGovernorate: vi.fn(async () => shortageResult),
  InsufficientPartnerStockError: class InsufficientPartnerStockError extends Error {},
}));

vi.mock("@/lib/audit/order-audit", () => ({
  logOrderCreated: vi.fn(async () => {}),
  logOrderConfirmed: vi.fn(async () => {}),
}));

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
    $transaction: async () => {
      throw new Error("must not reach the transaction");
    },
  },
}));

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

describe("placeOrder — NO_PARTNER shortages (10.51)", () => {
  it("admin: names the governorate, the first partner and each short item with SKU", async () => {
    const { placeOrder } = await import("./place-order");
    const result = await placeOrder({ ...baseInput, createdByAdmin: true });
    expect(result).toMatchObject({
      success: false,
      code: "NO_PARTNER_CAN_FULFILL_CART",
      error: "لا يوجد شريك في القاهرة يغطي كل الأصناف. الناقص لدى شريك القاهرة: test-product-M (SKU-1)",
      outOfStockItems: [{ variantId: "variant_1", sku: "SKU-1", productName: "منتج اختبار" }],
    });
  });

  it("public: item names only, never a partner name", async () => {
    const { placeOrder } = await import("./place-order");
    const result = await placeOrder(baseInput);
    expect(result).toMatchObject({
      success: false,
      error: "الأصناف التالية غير متوفرة حالياً، برجاء إزالتها من السلة: test-product-M",
    });
    expect((result as { error: string }).error).not.toContain("شريك");
  });

  it("admin: no eligible partner at all", async () => {
    shortageResult = { ok: false, reason: "NO_PARTNER" };
    const { placeOrder } = await import("./place-order");
    const result = await placeOrder({ ...baseInput, createdByAdmin: true });
    expect(result).toMatchObject({ success: false, error: "لا يوجد شريك يخدم محافظة القاهرة" });
  });

  it("public: no eligible partner keeps today's wording", async () => {
    shortageResult = { ok: false, reason: "NO_PARTNER" };
    const { placeOrder } = await import("./place-order");
    const result = await placeOrder(baseInput);
    expect(result).toMatchObject({
      success: false,
      error: "الأصناف المطلوبة غير متوفرة لدى شريك واحد في هذه المحافظة",
    });
  });
});
