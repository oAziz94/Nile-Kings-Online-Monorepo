import { describe, expect, it } from "vitest";
import { allocatedItemRevenue, attachRevenueDelta, buildHeadline, countDistinctOrdersByKey, type OrderForSales, type OrderItemForSales } from "./partner-sales-report";
import { netMerchandisePiastres } from "./queries";

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

describe("10.13 verifier fix — allocatedItemRevenue (product/category revenue reconciles to الإيراد)", () => {
  function orderWith(subtotal: number, discount: number): OrderForSales {
    return {
      id: "o1",
      status: "DELIVERED",
      totalPiastres: subtotal - discount + 2_500, // a fake shipping/COD surcharge on top.
      subtotalPiastres: subtotal,
      discountPiastres: discount,
      seniorFreeValuePiastres: 0,
      paymentMethod: "COD",
      createdAt: new Date("2026-09-10"),
      shippingAddress: { governorate: "القاهرة" },
      assignedPartnerId: "p1",
    };
  }

  it("splits the order's net merchandise by each item's share of the subtotal: 10,000 subtotal, 1,000 discount, items 6,000/4,000 -> 5,400/3,600, summing to the 9,000 headline", () => {
    const order = orderWith(10_000, 1_000);
    const orderById = new Map([[order.id, order]]);
    const item1Revenue = allocatedItemRevenue({ orderId: order.id, totalPiastres: 6_000 }, orderById);
    const item2Revenue = allocatedItemRevenue({ orderId: order.id, totalPiastres: 4_000 }, orderById);

    expect(item1Revenue).toBe(5_400);
    expect(item2Revenue).toBe(3_600);
    expect(item1Revenue + item2Revenue).toBe(netMerchandisePiastres(order)); // 9,000, exact here.
  });

  it("per-item rounding may drift the row sum from the headline, but never by more than ±1 piastre: three items of 3,333/3,333/3,334 off a 10,000 subtotal with a 1,000 discount", () => {
    const order = orderWith(10_000, 1_000);
    const orderById = new Map([[order.id, order]]);
    const items = [3_333, 3_333, 3_334].map((totalPiastres) => ({ orderId: order.id, totalPiastres }));
    const rows = items.map((it) => allocatedItemRevenue(it, orderById));
    const sum = rows.reduce((a, b) => a + b, 0);

    expect(Math.abs(sum - netMerchandisePiastres(order))).toBeLessThanOrEqual(1);
  });

  it("a zero-subtotal order (shouldn't happen, but never divide by zero) allocates 0 to every item", () => {
    const order = orderWith(0, 0);
    const orderById = new Map([[order.id, order]]);
    expect(allocatedItemRevenue({ orderId: order.id, totalPiastres: 500 }, orderById)).toBe(0);
  });

  it("an item whose order isn't in the lookup map allocates 0 (never throws)", () => {
    expect(allocatedItemRevenue({ orderId: "missing", totalPiastres: 500 }, new Map())).toBe(0);
  });
});

describe("10.14 (print-page review) — countDistinctOrdersByKey: the category breakdown's الطلبات column", () => {
  it("counts distinct orders per key, not per item — an order with two items in the same category counts once", () => {
    const items = [
      { orderId: "order-1", key: "shirts" },
      { orderId: "order-1", key: "shirts" }, // same order, second item, same category
      { orderId: "order-2", key: "shirts" },
      { orderId: "order-3", key: "pants" },
    ];
    const counts = countDistinctOrdersByKey(items, (it) => it.key);
    expect(counts.get("shirts")).toBe(2);
    expect(counts.get("pants")).toBe(1);
  });

  it("an order with items in two categories counts once in each — the same order can appear in more than one category's total", () => {
    const items = [
      { orderId: "order-1", key: "shirts" },
      { orderId: "order-1", key: "pants" },
    ];
    const counts = countDistinctOrdersByKey(items, (it) => it.key);
    expect(counts.get("shirts")).toBe(1);
    expect(counts.get("pants")).toBe(1);
  });

  it("no items -> an empty map", () => {
    expect(countDistinctOrdersByKey([], (it: { key: string }) => it.key).size).toBe(0);
  });
});
