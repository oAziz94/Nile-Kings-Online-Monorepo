import { describe, expect, it } from "vitest";
import type { PrismaTx } from "@/lib/inventory/partner-inventory";
import { cairoStartOfDayUtc, cairoDateIso } from "@/lib/analytics/cairo-day";
import { StoreSaleError } from "./create-sale";
import { isBeforeCairoToday, validateVoidReason, voidStoreSale } from "./void-sale";

type SaleRow = {
  id: string;
  receiptNo: number;
  partnerId: string;
  status: "COMPLETED" | "VOIDED";
  soldAt: Date;
  items: { variantId: string; quantity: number }[];
  voidedAt?: Date | null;
  voidReason?: string | null;
};

function fakeDb(opts: { partnerType?: "AGENT" | "DISTRIBUTOR"; sale: SaleRow | null; stock: Record<string, number> }) {
  const calls: string[] = [];
  const ledger: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray | { strings?: string[] }) => {
      const text = Array.isArray(strings)
        ? (strings as string[]).join("?")
        : ((strings as { strings?: string[] }).strings ?? []).join("?");
      if (text.includes('FROM "Partner"')) {
        calls.push("lock:partner");
        return [{ id: "p1", partnerType: opts.partnerType ?? "DISTRIBUTOR" }];
      }
      calls.push("lock:inventory");
      return Object.keys(opts.stock)
        .sort()
        .map((variantId) => ({ variantId }));
    },
    storeSale: {
      findFirst: async ({ where }: { where: { id: string; partnerId: string } }) =>
        opts.sale && opts.sale.id === where.id && opts.sale.partnerId === where.partnerId ? opts.sale : null,
      update: async ({ data }: { data: Partial<SaleRow> }) => {
        calls.push("sale:update");
        Object.assign(opts.sale!, data);
        return opts.sale;
      },
    },
    partnerInventory: {
      update: async ({
        where,
        data,
      }: {
        where: { partnerId_variantId: { variantId: string } };
        data: { stockAvailable: { increment: number } };
      }) => {
        opts.stock[where.partnerId_variantId.variantId] += data.stockAvailable.increment;
        calls.push(`stock:${where.partnerId_variantId.variantId}`);
      },
      create: async ({ data }: { data: { variantId: string; stockAvailable: number } }) => {
        opts.stock[data.variantId] = data.stockAvailable;
        calls.push(`stock-create:${data.variantId}`);
      },
    },
    inventoryLedger: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        ledger.push(data);
      },
    },
  };
  return { tx: tx as unknown as PrismaTx, calls, ledger, stock: opts.stock };
}

const NOW = new Date("2026-10-17T10:00:00.000Z");
const todaySale = (over: Partial<SaleRow> = {}): SaleRow => ({
  id: "s1",
  receiptNo: 7,
  partnerId: "p1",
  status: "COMPLETED",
  soldAt: new Date("2026-10-17T08:00:00.000Z"),
  items: [
    { variantId: "v2", quantity: 1 },
    { variantId: "v1", quantity: 3 },
  ],
  ...over,
});

describe("validateVoidReason", () => {
  it("accepts 3-200 trimmed chars and rejects the rest", () => {
    expect(validateVoidReason("  خطأ  ")).toEqual({ ok: true, reason: "خطأ" });
    expect(validateVoidReason("ab").ok).toBe(false);
    expect(validateVoidReason("   ").ok).toBe(false);
    expect(validateVoidReason(undefined).ok).toBe(false);
    expect(validateVoidReason("x".repeat(200)).ok).toBe(true);
    expect(validateVoidReason("x".repeat(201)).ok).toBe(false);
  });
});

describe("isBeforeCairoToday", () => {
  it("is false at Cairo midnight and after, true one millisecond before", () => {
    const mid = cairoStartOfDayUtc(cairoDateIso(NOW));
    expect(isBeforeCairoToday(mid, NOW)).toBe(false);
    expect(isBeforeCairoToday(new Date(mid.getTime() - 1), NOW)).toBe(true);
  });
});

describe("voidStoreSale", () => {
  it("locks partner then inventory, puts stock back per line, writes STORE_SALE_VOID ledger and voids", async () => {
    const sale = todaySale();
    const db = fakeDb({ sale, stock: { v1: 5, v2: 0 } });
    const out = (await voidStoreSale(db.tx, {
      partnerId: "p1",
      saleId: "s1",
      reason: " غلطة ",
      actor: "OUTLET",
      now: NOW,
    })) as unknown as SaleRow;

    expect(db.calls.slice(0, 2)).toEqual(["lock:partner", "lock:inventory"]);
    expect(db.stock).toEqual({ v1: 8, v2: 1 });
    expect(db.ledger).toHaveLength(2);
    expect(
      db.ledger.every(
        (l) => l.reason === "STORE_SALE_VOID" && l.quantityReservedDelta === 0 && l.notes === "store-sale-void:s1 · إيصال 7"
      )
    ).toBe(true);
    expect(db.ledger.map((l) => l.quantityAvailableDelta).sort()).toEqual([1, 3]);
    expect(out.status).toBe("VOIDED");
    expect(out.voidReason).toBe("غلطة");
    expect(out.voidedAt).toEqual(NOW);
    expect(out.receiptNo).toBe(7);
  });

  it("refuses 409 unless COMPLETED and changes nothing", async () => {
    const db = fakeDb({ sale: todaySale({ status: "VOIDED" }), stock: { v1: 5, v2: 0 } });
    await expect(
      voidStoreSale(db.tx, { partnerId: "p1", saleId: "s1", reason: "سبب", actor: "OUTLET", now: NOW })
    ).rejects.toMatchObject({ status: 409 });
    expect(db.ledger).toHaveLength(0);
    expect(db.stock).toEqual({ v1: 5, v2: 0 });
  });

  it("refuses an outlet voiding a sale from before Cairo midnight (403) but lets the admin", async () => {
    const yesterday = new Date(cairoStartOfDayUtc(cairoDateIso(NOW)).getTime() - 3_600_000);
    const outletDb = fakeDb({ sale: todaySale({ soldAt: yesterday }), stock: { v1: 5, v2: 0 } });
    const err = await voidStoreSale(outletDb.tx, {
      partnerId: "p1",
      saleId: "s1",
      reason: "سبب",
      actor: "OUTLET",
      now: NOW,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(StoreSaleError);
    expect(err).toMatchObject({ status: 403, publicMessage: "يمكن إلغاء إيصال اليوم فقط" });
    expect(outletDb.stock).toEqual({ v1: 5, v2: 0 });

    const adminDb = fakeDb({ sale: todaySale({ soldAt: yesterday }), stock: { v1: 5, v2: 0 } });
    await voidStoreSale(adminDb.tx, { partnerId: "p1", saleId: "s1", reason: "سبب", actor: "ADMIN", now: NOW });
    expect(adminDb.stock).toEqual({ v1: 8, v2: 1 });
  });

  it("rejects a bad reason with 400 before locking anything", async () => {
    const db = fakeDb({ sale: todaySale(), stock: { v1: 5, v2: 0 } });
    await expect(
      voidStoreSale(db.tx, { partnerId: "p1", saleId: "s1", reason: "ab", actor: "OUTLET", now: NOW })
    ).rejects.toMatchObject({ status: 400 });
    expect(db.calls).toEqual([]);
  });

  it("404 for another outlet's sale, 403 for an AGENT partner", async () => {
    const other = fakeDb({ sale: todaySale({ partnerId: "other" }), stock: {} });
    await expect(
      voidStoreSale(other.tx, { partnerId: "p1", saleId: "s1", reason: "سبب", actor: "OUTLET", now: NOW })
    ).rejects.toMatchObject({ status: 404 });
    const agent = fakeDb({ partnerType: "AGENT", sale: todaySale(), stock: {} });
    await expect(
      voidStoreSale(agent.tx, { partnerId: "p1", saleId: "s1", reason: "سبب", actor: "ADMIN", now: NOW })
    ).rejects.toMatchObject({ status: 403 });
  });

  it("recreates a removed stock row so units are not lost", async () => {
    const db = fakeDb({ sale: todaySale({ items: [{ variantId: "vx", quantity: 2 }] }), stock: {} });
    await voidStoreSale(db.tx, { partnerId: "p1", saleId: "s1", reason: "سبب", actor: "OUTLET", now: NOW });
    expect(db.stock).toEqual({ vx: 2 });
  });
});
