import { describe, expect, it } from "vitest";
import type { PrismaTx } from "@/lib/inventory/partner-inventory";
import { createStoreSale, shortStockMessage, StoreSaleError } from "./create-sale";
import { nextReceiptNo } from "./receipt-number";
import { MAX_SALE_LINES, validateSaleBody } from "./validation";

type Stock = { stockAvailable: number; stockReserved: number };

/** In-memory stand-in for the slice of the transaction client `createStoreSale` touches. */
function fakeDb(opts: { partnerType?: "AGENT" | "DISTRIBUTOR"; stock: Record<string, Stock>; lastReceiptNo?: number | null }) {
  const calls: string[] = [];
  const ledger: Record<string, unknown>[] = [];
  const sales: Record<string, unknown>[] = [];
  let maxNo = opts.lastReceiptNo ?? null;
  const variants = Object.keys(opts.stock).map((id) => ({
    id,
    sku: `SKU-${id}`,
    name: "M",
    colorName: "أحمر",
    pricePiastres: 10000,
    product: { name: `منتج ${id}` },
  }));
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray | { strings?: string[]; sql?: string }) => {
      const text = Array.isArray(strings)
        ? (strings as string[]).join("?")
        : ((strings as { strings?: string[] }).strings ?? []).join("?");
      if (text.includes('FROM "Partner"')) {
        calls.push("lock:partner");
        return [{ id: "p1", partnerType: opts.partnerType ?? "DISTRIBUTOR" }];
      }
      calls.push("lock:inventory");
      return Object.entries(opts.stock).map(([variantId, s]) => ({ variantId, ...s }));
    },
    variant: { findMany: async () => variants },
    storeSale: {
      aggregate: async () => ({ _max: { receiptNo: maxNo } }),
      create: async ({ data }: { data: Record<string, unknown> & { items: { create: Record<string, unknown>[] } } }) => {
        calls.push("sale:create");
        maxNo = data.receiptNo as number;
        const row = { id: `sale${sales.length + 1}`, ...data, items: data.items.create };
        sales.push(row);
        return row;
      },
    },
    partnerInventory: {
      update: async ({ where, data }: { where: { partnerId_variantId: { variantId: string } }; data: { stockAvailable: { decrement: number } } }) => {
        const v = where.partnerId_variantId.variantId;
        opts.stock[v].stockAvailable -= data.stockAvailable.decrement;
        calls.push(`stock:${v}`);
      },
    },
    inventoryLedger: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
      },
    },
  };
  return { tx: tx as unknown as PrismaTx, calls, ledger, sales, stock: opts.stock };
}

const sale = (items: { variantId: string; quantity: number }[], extra: Record<string, unknown> = {}) => {
  const parsed = validateSaleBody({ items, paymentMethod: "CASH", ...extra });
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.value;
};

describe("createStoreSale", () => {
  it("decrements stock, writes STORE_SALE ledger per line, snapshots price/name/sku and totals", async () => {
    const db = fakeDb({ stock: { v1: { stockAvailable: 10, stockReserved: 2 }, v2: { stockAvailable: 5, stockReserved: 0 } } });
    const created = (await createStoreSale(db.tx, {
      partnerId: "p1",
      recordedByUserId: "u1",
      sale: sale([{ variantId: "v1", quantity: 3 }, { variantId: "v2", quantity: 1 }], { sellerName: " منى " }),
    })) as unknown as Record<string, unknown>;

    expect(db.calls.slice(0, 2)).toEqual(["lock:partner", "lock:inventory"]);
    expect(created.receiptNo).toBe(1);
    expect(created.subtotalPiastres).toBe(40000);
    expect(created.sellerName).toBe("منى");
    expect(created.recordedByUserId).toBe("u1");
    expect(db.stock.v1.stockAvailable).toBe(7);
    expect(db.stock.v1.stockReserved).toBe(2);
    expect(db.ledger).toHaveLength(2);
    expect(db.ledger[0]).toMatchObject({ reason: "STORE_SALE", quantityAvailableDelta: -3, quantityReservedDelta: 0 });
    expect(String(db.ledger[0].notes)).toContain("store-sale:sale1");
    const items = created.items as Record<string, unknown>[];
    expect(items[0]).toMatchObject({ unitPricePiastres: 10000, productName: "منتج v1", variantName: "M – أحمر", sku: "SKU-v1" });
  });

  it("refuses with 409 naming the short lines and writes nothing", async () => {
    const db = fakeDb({ stock: { v1: { stockAvailable: 4, stockReserved: 2 }, v2: { stockAvailable: 5, stockReserved: 0 } } });
    const err = await createStoreSale(db.tx, {
      partnerId: "p1",
      recordedByUserId: null,
      sale: sale([{ variantId: "v1", quantity: 3 }, { variantId: "v2", quantity: 1 }]),
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StoreSaleError);
    expect(err.status).toBe(409);
    expect(err.publicMessage).toBe("المتاح من منتج v1 — M – أحمر 2 فقط");
    expect(err.shortLines).toEqual([{ variantId: "v1", label: "منتج v1 — M – أحمر", available: 2 }]);
    expect(db.sales).toHaveLength(0);
    expect(db.ledger).toHaveLength(0);
    expect(db.stock.v1.stockAvailable).toBe(4);
  });

  it("numbers receipts max + 1 per outlet", async () => {
    const db = fakeDb({ stock: { v1: { stockAvailable: 10, stockReserved: 0 } }, lastReceiptNo: 41 });
    const a = (await createStoreSale(db.tx, { partnerId: "p1", recordedByUserId: null, sale: sale([{ variantId: "v1", quantity: 1 }]) })) as unknown as { receiptNo: number };
    const b = (await createStoreSale(db.tx, { partnerId: "p1", recordedByUserId: null, sale: sale([{ variantId: "v1", quantity: 1 }]) })) as unknown as { receiptNo: number };
    expect([a.receiptNo, b.receiptNo]).toEqual([42, 43]);
  });

  it("refuses an AGENT with 403 before touching stock", async () => {
    const db = fakeDb({ partnerType: "AGENT", stock: { v1: { stockAvailable: 10, stockReserved: 0 } } });
    const err = await createStoreSale(db.tx, { partnerId: "p1", recordedByUserId: null, sale: sale([{ variantId: "v1", quantity: 1 }]) }).catch((e) => e);
    expect(err).toBeInstanceOf(StoreSaleError);
    expect(err.status).toBe(403);
    expect(db.calls).toEqual(["lock:partner"]);
  });
});

describe("nextReceiptNo", () => {
  it("starts at 1 and increments", () => {
    expect(nextReceiptNo(null)).toBe(1);
    expect(nextReceiptNo(undefined)).toBe(1);
    expect(nextReceiptNo(7)).toBe(8);
  });
});

describe("shortStockMessage", () => {
  it("joins the short lines", () => {
    expect(shortStockMessage([{ label: "أ", available: 2 }, { label: "ب", available: 0 }])).toBe("المتاح من أ 2 فقط، المتاح من ب 0 فقط");
  });
});

describe("validateSaleBody", () => {
  const line = { variantId: "v1", quantity: 1 };

  it("normalises a valid customer phone to E.164", () => {
    const r = validateSaleBody({ items: [line], paymentMethod: "CARD", customerPhone: "01012345678" });
    expect(r.ok && r.value.customerPhone).toBe("+201012345678");
  });

  it("rejects an invalid phone", () => {
    expect(validateSaleBody({ items: [line], paymentMethod: "CASH", customerPhone: "12345" }).ok).toBe(false);
  });

  it("rejects more than 50 lines", () => {
    const items = Array.from({ length: MAX_SALE_LINES + 1 }, (_, i) => ({ variantId: `v${i}`, quantity: 1 }));
    expect(validateSaleBody({ items, paymentMethod: "CASH" }).ok).toBe(false);
    expect(validateSaleBody({ items: items.slice(0, MAX_SALE_LINES), paymentMethod: "CASH" }).ok).toBe(true);
  });

  it("rejects quantity outside 1-99, empty carts and bad payment methods", () => {
    expect(validateSaleBody({ items: [{ variantId: "v1", quantity: 0 }], paymentMethod: "CASH" }).ok).toBe(false);
    expect(validateSaleBody({ items: [{ variantId: "v1", quantity: 100 }], paymentMethod: "CASH" }).ok).toBe(false);
    expect(validateSaleBody({ items: [], paymentMethod: "CASH" }).ok).toBe(false);
    expect(validateSaleBody({ items: [line], paymentMethod: "CHEQUE" }).ok).toBe(false);
  });

  it("merges duplicate variants", () => {
    const r = validateSaleBody({ items: [line, line], paymentMethod: "CASH" });
    expect(r.ok && r.value.items).toEqual([{ variantId: "v1", quantity: 2 }]);
  });
});
