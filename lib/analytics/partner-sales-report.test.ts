import { describe, expect, it } from "vitest";
import { attachRevenueDelta, buildHeadline, type OrderForSales, type OrderItemForSales } from "./partner-sales-report";

describe("7.4 — attachRevenueDelta (shared by category/governorate/payment breakdown rows)", () => {
  it("a key present in both periods gets a hand-computed delta; a current-only key compares against 0", () => {
    const currentRows = [
      { key: "cairo", label: "القاهرة", units: 10, revenuePiastres: 30_000, orderCount: 3 },
      { key: "giza", label: "الجيزة", units: 2, revenuePiastres: 8_000, orderCount: 1 },
    ];
    // cairo: 30,000 now vs. 20,000 previously -> up, +50%. giza: no previous-period row.
    const previousByKey = new Map([["cairo", 20_000]]);
    const rows = attachRevenueDelta(currentRows, previousByKey);

    const cairo = rows.find((r) => r.key === "cairo")!;
    expect(cairo.previousRevenuePiastres).toBe(20_000);
    expect(cairo.revenueDelta).toEqual({ direction: "up", changeAbs: 10_000, changePct: 50 });

    const giza = rows.find((r) => r.key === "giza")!;
    expect(giza.previousRevenuePiastres).toBe(0);
    expect(giza.revenueDelta.direction).toBe("up");
    expect(giza.revenueDelta.changePct).toBeNull(); // previous is 0, current isn't -> undefined %

    // Every existing field survives the attach step (additive-only).
    expect(cairo.units).toBe(10);
    expect(cairo.orderCount).toBe(3);
    expect(cairo.label).toBe("القاهرة");
  });

  it("a key with equal current and previous revenue reports a flat, defined 0% delta", () => {
    const currentRows = [{ key: "cod", label: "الدفع عند الاستلام", units: 0, revenuePiastres: 15_000, orderCount: 2 }];
    const rows = attachRevenueDelta(currentRows, new Map([["cod", 15_000]]));
    expect(rows[0].revenueDelta).toEqual({ direction: "flat", changeAbs: 0, changePct: 0 });
  });
});

describe("10.13 — buildHeadline: the accomplished/active order set and net-merchandise revenue", () => {
  // One order per status the owner named, per the backlog's own test recipe: a DELIVERED, a
  // SHIPPED, a CANCELLED and a CREATED order, all in the current period, none in the previous.
  const deliveredOrder: OrderForSales = {
    id: "o-delivered",
    status: "DELIVERED",
    totalPiastres: 12_000, // subtotal + shipping + COD fee — must NOT be what revenue reads.
    subtotalPiastres: 10_000,
    discountPiastres: 1_000,
    seniorFreeValuePiastres: 0,
    paymentMethod: "COD",
    createdAt: new Date("2026-09-10"),
    shippingAddress: { governorate: "القاهرة" },
    assignedPartnerId: "p1",
  };
  const shippedOrder: OrderForSales = {
    id: "o-shipped",
    status: "SHIPPED",
    totalPiastres: 9_000,
    subtotalPiastres: 8_000,
    discountPiastres: 0,
    seniorFreeValuePiastres: 0,
    paymentMethod: "COD",
    createdAt: new Date("2026-09-11"),
    shippingAddress: { governorate: "القاهرة" },
    assignedPartnerId: "p1",
  };
  const cancelledOrder: OrderForSales = {
    id: "o-cancelled",
    status: "CANCELLED",
    totalPiastres: 5_000,
    subtotalPiastres: 5_000,
    discountPiastres: 0,
    seniorFreeValuePiastres: 0,
    paymentMethod: "COD",
    createdAt: new Date("2026-09-12"),
    shippingAddress: { governorate: "الجيزة" },
    assignedPartnerId: "p1",
  };
  const createdOrder: OrderForSales = {
    id: "o-created",
    status: "CREATED",
    totalPiastres: 3_000,
    subtotalPiastres: 3_000,
    discountPiastres: 0,
    seniorFreeValuePiastres: 0,
    paymentMethod: "COD",
    createdAt: new Date("2026-09-13"),
    shippingAddress: { governorate: "الجيزة" },
    assignedPartnerId: "p1",
  };
  const currentOrders = [deliveredOrder, shippedOrder, cancelledOrder, createdOrder];
  const previousOrders: OrderForSales[] = [];

  function itemsFor(order: OrderForSales, quantity: number): OrderItemForSales {
    return {
      orderId: order.id,
      variantId: "v1",
      quantity,
      totalPiastres: order.subtotalPiastres,
      productName: "منتج",
      variantName: "M",
      assignedPartnerId: order.assignedPartnerId,
    };
  }

  it("accomplished: counts only the DELIVERED order, revenue is subtotal − discount (net merchandise, no shipping/COD)", () => {
    const currentItems = [itemsFor(deliveredOrder, 2)];
    const headline = buildHeadline(currentOrders, previousOrders, currentItems, [], "accomplished");
    const byKey = Object.fromEntries(headline.map((h) => [h.key, h.value]));

    expect(byKey.orders).toBe(1);
    expect(byKey.revenue).toBe(9_000); // 10,000 − 1,000, never 12,000 (totalPiastres).
    expect(byKey.units).toBe(2);
    expect(byKey.averageOrder).toBe(9_000);
    // نسبة الإلغاء stays as today: cancelled ÷ every order created in the period (4), whatever the filter.
    expect(byKey.cancellationRate).toBe(25);
  });

  it("active: counts only the SHIPPED order, revenue is its own subtotal, and the cancel rate is unchanged from the accomplished run", () => {
    const currentItems = [itemsFor(shippedOrder, 1)];
    const headline = buildHeadline(currentOrders, previousOrders, currentItems, [], "active");
    const byKey = Object.fromEntries(headline.map((h) => [h.key, h.value]));

    expect(byKey.orders).toBe(1);
    expect(byKey.revenue).toBe(8_000);
    expect(byKey.units).toBe(1);
    expect(byKey.averageOrder).toBe(8_000);
    expect(byKey.cancellationRate).toBe(25); // same basis, same 4-order denominator as accomplished.
  });

  it("the revenue tile's hint says the basis excludes shipping and the COD fee, for both sets", () => {
    const accomplished = buildHeadline(currentOrders, previousOrders, [itemsFor(deliveredOrder, 1)], [], "accomplished");
    const active = buildHeadline(currentOrders, previousOrders, [itemsFor(shippedOrder, 1)], [], "active");
    expect(accomplished.find((h) => h.key === "revenue")?.hint).toBe("بدون الشحن ورسوم الدفع عند الاستلام");
    expect(active.find((h) => h.key === "revenue")?.hint).toBe("بدون الشحن ورسوم الدفع عند الاستلام");
  });
});
