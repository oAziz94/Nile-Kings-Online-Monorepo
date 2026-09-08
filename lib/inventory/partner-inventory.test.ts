/**
 * End-to-end tests for the order/inventory lifecycle, exercising the REAL functions in
 * partner-inventory.ts against an in-memory fake Prisma layer (no real DB, no mocked
 * business logic). Covers:
 *   1. Order placement consumes the assigned partner's inventory.
 *   2. A partner that can't cover every line is rejected with the specific short items
 *      (customer-facing "insufficient stock" signal).
 *   3. Partner edits to order items after placement reconcile stock correctly.
 *   4. Rerouting to another partner checks the new partner's stock first and only then
 *      releases the old partner / decrements the new partner.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Prisma as PrismaNS } from "@prisma/client";

type Row = {
  id: string;
  partnerId: string;
  variantId: string;
  stockAvailable: number;
  stockReserved: number;
};

type LedgerRow = {
  partnerId: string;
  variantId: string;
  reason: string;
  quantityAvailableDelta: number;
  quantityReservedDelta: number;
  orderId?: string | null;
  notes?: string | null;
};

/** Minimal in-memory stand-in for the slice of PrismaClient this module touches. */
class FakeDb {
  rows: Row[] = [];
  ledger: LedgerRow[] = [];
  partners: { id: string; isActive: boolean; governorate: string }[] = [];
  reroutingRules: any[] = [];
  private seq = 0;

  seedInventory(partnerId: string, variantId: string, stockAvailable: number, stockReserved = 0) {
    this.rows.push({ id: `row_${++this.seq}`, partnerId, variantId, stockAvailable, stockReserved });
  }

  private findRow(partnerId: string, variantId: string) {
    return this.rows.find((r) => r.partnerId === partnerId && r.variantId === variantId);
  }

  partnerInventory = {
    findMany: async ({ where }: any) => {
      const variantIds: string[] | undefined = where.variantId?.in;
      return this.rows.filter(
        (r) =>
          r.partnerId === where.partnerId &&
          (!variantIds || variantIds.includes(r.variantId))
      );
    },
    findUnique: async ({ where }: any) => {
      const { partnerId, variantId } = where.partnerId_variantId;
      return this.findRow(partnerId, variantId) ?? null;
    },
    update: async ({ where, data }: any) => {
      const row = this.rows.find((r) => r.id === where.id);
      if (!row) throw new Error("row not found");
      if (data.stockReserved?.decrement !== undefined) row.stockReserved -= data.stockReserved.decrement;
      if (data.stockReserved?.increment !== undefined) row.stockReserved += data.stockReserved.increment;
      if (data.stockAvailable?.increment !== undefined) row.stockAvailable += data.stockAvailable.increment;
      if (data.stockAvailable?.decrement !== undefined) row.stockAvailable -= data.stockAvailable.decrement;
      return row;
    },
    upsert: async ({ where, update, create }: any) => {
      const { partnerId, variantId } = where.partnerId_variantId;
      const existing = this.findRow(partnerId, variantId);
      if (existing) {
        if (update.stockAvailable?.increment !== undefined) existing.stockAvailable += update.stockAvailable.increment;
        if (update.stockReserved?.increment !== undefined) existing.stockReserved += update.stockReserved.increment;
        return existing;
      }
      const row: Row = { id: `row_${++this.seq}`, partnerId, variantId, ...create };
      this.rows.push(row);
      return row;
    },
  };

  inventoryLedger = {
    create: async ({ data }: any) => {
      this.ledger.push(data);
      return data;
    },
    createMany: async ({ data }: any) => {
      this.ledger.push(...data);
      return { count: data.length };
    },
  };

  partner = {
    findFirst: async ({ where }: any) => {
      const p = this.partners.find((x) => x.id === where.id && (!where.isActive || x.isActive));
      return p ? { id: p.id, governorate: p.governorate } : null;
    },
  };

  reroutingRule = {
    findFirst: async ({ where }: any) => {
      const rule = this.reroutingRules.find(
        (r) => r.governorate === where.governorate && r.isActive === where.isActive
      );
      if (!rule) return null;
      return {
        ...rule,
        partners: rule.partners
          .filter((p: any) => p.isActive && this.partners.find((pt) => pt.id === p.partnerId)?.isActive)
          .sort((a: any, b: any) => a.priority - b.priority)
          .map((p: any) => ({
            ...p,
            partner: this.partners.find((pt) => pt.id === p.partnerId),
          })),
      };
    },
  };

  /** Reproduces the two raw UPDATE statements + the FOR UPDATE lock used in partner-inventory.ts. */
  $executeRaw = async (query: any) => {
    const sql: string = query.sql;
    const values: any[] = query.values;
    if (sql.includes("FOR UPDATE")) return 0; // row lock only, no state change to simulate
    const isReserve = sql.includes(`"stockReserved" = pi."stockReserved" + v.qty`);
    const isCommit = sql.includes(`"stockAvailable" = pi."stockAvailable" - v.qty`);
    if (!isReserve && !isCommit) throw new Error(`FakeDb: unrecognized raw query: ${sql}`);
    const partnerId = values[values.length - 1];
    for (let i = 0; i < values.length - 1; i += 2) {
      const variantId = values[i];
      const qty = values[i + 1];
      const row = this.findRow(partnerId, variantId);
      if (!row) continue;
      if (isReserve) row.stockReserved += qty;
      if (isCommit) {
        row.stockAvailable -= qty;
        row.stockReserved -= qty;
      }
    }
    return 1;
  };
}

const fakeDb = new FakeDb();

vi.mock("@/lib/db", () => ({
  get prisma() {
    return fakeDb;
  },
}));

// Import after the mock so the module under test picks up the fake `prisma` singleton.
const {
  reservePartnerStockForOrder,
  commitPartnerReservation,
  releasePartnerReservation,
  restorePartnerCommittedStock,
  reconcilePartnerStockForAdminOrderItemEdit,
  reassignReservedPartnerStock,
  canPartnerFulfillLines,
  findFulfillablePartnerForGovernorate,
  InsufficientPartnerStockError,
} = await import("./partner-inventory");

function sellable(partnerId: string, variantId: string) {
  const row = fakeDb.rows.find((r) => r.partnerId === partnerId && r.variantId === variantId);
  return row ? row.stockAvailable - row.stockReserved : 0;
}
function raw(partnerId: string, variantId: string) {
  const row = fakeDb.rows.find((r) => r.partnerId === partnerId && r.variantId === variantId);
  return { available: row?.stockAvailable ?? 0, reserved: row?.stockReserved ?? 0 };
}

beforeEach(() => {
  fakeDb.rows = [];
  fakeDb.ledger = [];
  fakeDb.partners = [];
  fakeDb.reroutingRules = [];
});

const PARTNER_A = "partner_a";
const PARTNER_B = "partner_b";
const VARIANT_1 = "variant_1";
const VARIANT_2 = "variant_2";
const ORDER_1 = "order_1";

describe("1. Order placement consumes the assigned partner's inventory", () => {
  it("reserves then commits stock against the assigned partner only", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_B, VARIANT_1, 10); // untouched partner, must stay intact

    const lines = [{ variantId: VARIANT_1, quantity: 3 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);

    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 3 });
    expect(sellable(PARTNER_A, VARIANT_1)).toBe(7);
    // reservation must not touch stockAvailable yet, and must not touch the other partner
    expect(raw(PARTNER_B, VARIANT_1)).toEqual({ available: 10, reserved: 0 });

    await commitPartnerReservation(fakeDb as any, PARTNER_A, lines, ORDER_1);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 7, reserved: 0 });
    expect(raw(PARTNER_B, VARIANT_1)).toEqual({ available: 10, reserved: 0 });

    const reasons = fakeDb.ledger.map((l) => l.reason);
    expect(reasons).toEqual(["ORDER_RESERVE", "ORDER_COMMIT"]);
  });

  it("records the actor source string passed in, so who/what triggered the change is auditable", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    const lines = [{ variantId: VARIANT_1, quantity: 3 }];

    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1, "Customer checkout");
    await commitPartnerReservation(fakeDb as any, PARTNER_A, lines, ORDER_1, "Customer checkout");

    expect(fakeDb.ledger.map((l) => l.notes)).toEqual(["Customer checkout", "Customer checkout"]);
  });

  it("leaves notes null when no actor source is passed (back-compat: existing callers unaffected)", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    const lines = [{ variantId: VARIANT_1, quantity: 3 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);
    expect(fakeDb.ledger[0].notes).toBeNull();
  });

  it("aggregates duplicate variant lines before checking/mutating stock", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 5);
    const lines = [
      { variantId: VARIANT_1, quantity: 2 },
      { variantId: VARIANT_1, quantity: 2 },
    ];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 5, reserved: 4 });
  });

  it("throws InsufficientPartnerStockError and leaves stock untouched when the partner can't cover a line", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 2);
    const lines = [{ variantId: VARIANT_1, quantity: 5 }];
    await expect(reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1)).rejects.toThrow(
      InsufficientPartnerStockError
    );
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 2, reserved: 0 });
    expect(fakeDb.ledger).toHaveLength(0);
  });
});

describe("2. Partial fulfillment: customer notified about the specific short item", () => {
  beforeEach(() => {
    fakeDb.partners.push({ id: PARTNER_A, isActive: true, governorate: "Cairo" });
  });

  it("canPartnerFulfillLines is false when any single line is short", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 5);
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 1);
    const ok = await canPartnerFulfillLines(PARTNER_A, [
      { variantId: VARIANT_1, quantity: 2 },
      { variantId: VARIANT_2, quantity: 3 },
    ]);
    expect(ok).toBe(false);
  });

  it("findFulfillablePartnerForGovernorate reports exactly the insufficient variant ids for the preferred partner", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 5); // enough
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 1); // short

    const result = await findFulfillablePartnerForGovernorate({
      governorate: "Cairo",
      preferredPartnerId: PARTNER_A,
      lines: [
        { variantId: VARIANT_1, quantity: 2 },
        { variantId: VARIANT_2, quantity: 3 },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("INSUFFICIENT_STOCK");
      if (result.reason === "INSUFFICIENT_STOCK") {
        expect(result.insufficientVariantIds).toEqual([VARIANT_2]);
        expect(result.insufficientVariantIds).not.toContain(VARIANT_1);
      }
    }
  });

  it("succeeds when the preferred partner can cover every line", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 5);
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 5);
    const result = await findFulfillablePartnerForGovernorate({
      governorate: "Cairo",
      preferredPartnerId: PARTNER_A,
      lines: [
        { variantId: VARIANT_1, quantity: 2 },
        { variantId: VARIANT_2, quantity: 3 },
      ],
    });
    expect(result).toMatchObject({ ok: true, partnerId: PARTNER_A });
  });

  it("does NOT fall back to another partner when the preferred partner is short (order fails naming the item, per design)", async () => {
    fakeDb.partners.push({ id: PARTNER_B, isActive: true, governorate: "Cairo" });
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 0); // preferred partner: short
    fakeDb.seedInventory(PARTNER_B, VARIANT_1, 99); // other partner: plenty, but must be ignored

    const result = await findFulfillablePartnerForGovernorate({
      governorate: "Cairo",
      preferredPartnerId: PARTNER_A,
      lines: [{ variantId: VARIANT_1, quantity: 1 }],
    });

    expect(result).toMatchObject({ ok: false, reason: "INSUFFICIENT_STOCK" });
  });
});

describe("3. Partner edits order items after placement: stock reconciles", () => {
  it("CREATED order: releases the old reservation and reserves the new lines instead", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 10);

    const oldLines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, oldLines, ORDER_1);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 4 });

    const newLines = [{ variantId: VARIANT_2, quantity: 6 }];
    await reconcilePartnerStockForAdminOrderItemEdit(fakeDb as any, PARTNER_A, "CREATED", oldLines, newLines, ORDER_1);

    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 0 }); // released
    expect(raw(PARTNER_A, VARIANT_2)).toEqual({ available: 10, reserved: 6 }); // newly reserved, not yet committed
  });

  it("tags every ledger row from a reconcile with the given actor source (e.g. distinguishing an admin edit from a partner edit)", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 10);
    const oldLines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, oldLines, ORDER_1);
    fakeDb.ledger = [];

    const newLines = [{ variantId: VARIANT_2, quantity: 6 }];
    await reconcilePartnerStockForAdminOrderItemEdit(
      fakeDb as any,
      PARTNER_A,
      "CREATED",
      oldLines,
      newLines,
      ORDER_1,
      "Partner order edit"
    );

    expect(fakeDb.ledger.length).toBeGreaterThan(0);
    expect(fakeDb.ledger.every((l) => l.notes === "Partner order edit")).toBe(true);
  });

  it("CONFIRMED order: restores old committed stock, then reserves+commits the new lines", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 10);

    const originalLines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, originalLines, ORDER_1);
    await commitPartnerReservation(fakeDb as any, PARTNER_A, originalLines, ORDER_1);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 6, reserved: 0 });

    const newLines = [{ variantId: VARIANT_2, quantity: 3 }];
    await reconcilePartnerStockForAdminOrderItemEdit(
      fakeDb as any,
      PARTNER_A,
      "CONFIRMED",
      originalLines,
      newLines,
      ORDER_1
    );

    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 0 }); // fully restored
    expect(raw(PARTNER_A, VARIANT_2)).toEqual({ available: 7, reserved: 0 }); // committed immediately
  });

  it("rejects the edit (InsufficientPartnerStockError) when the new lines exceed available stock, without side effects on unrelated variants", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_A, VARIANT_2, 1);

    const oldLines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, oldLines, ORDER_1);

    const newLines = [{ variantId: VARIANT_2, quantity: 5 }]; // only 1 available
    await expect(
      reconcilePartnerStockForAdminOrderItemEdit(fakeDb as any, PARTNER_A, "CREATED", oldLines, newLines, ORDER_1)
    ).rejects.toThrow(InsufficientPartnerStockError);
  });

  it("rejects reconciliation for an unsupported status (e.g. CANCELLED)", async () => {
    await expect(
      reconcilePartnerStockForAdminOrderItemEdit(fakeDb as any, PARTNER_A, "CANCELLED" as any, [], [], ORDER_1)
    ).rejects.toThrow(/not supported/);
  });
});

describe("4. Rerouting to another partner: checked-first swap that releases old / decrements new", () => {
  it("checks the new partner's stock before finalizing, and moves stock correctly on success (CREATED order)", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_B, VARIANT_1, 10);

    const lines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 4 });

    await reassignReservedPartnerStock({
      routedOrderId: "routed_1",
      oldPartnerId: PARTNER_A,
      newPartnerId: PARTNER_B,
      orderId: ORDER_1,
      orderStatus: "CREATED",
      lines,
      tx: fakeDb as any,
    });

    // old partner: reservation released, available untouched (was never committed)
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 0 });
    // new partner: now holds the reservation
    expect(raw(PARTNER_B, VARIANT_1)).toEqual({ available: 10, reserved: 4 });
  });

  it("checks the new partner's stock before finalizing, and moves stock correctly on success (committed order)", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_B, VARIANT_1, 10);

    const lines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);
    await commitPartnerReservation(fakeDb as any, PARTNER_A, lines, ORDER_1);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 6, reserved: 0 });

    await reassignReservedPartnerStock({
      routedOrderId: "routed_1",
      oldPartnerId: PARTNER_A,
      newPartnerId: PARTNER_B,
      orderId: ORDER_1,
      orderStatus: "CONFIRMED",
      lines,
      tx: fakeDb as any,
    });

    // old partner: fully restored to available (committed stock returned)
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 0 });
    // new partner: reserved then immediately committed (decremented)
    expect(raw(PARTNER_B, VARIANT_1)).toEqual({ available: 6, reserved: 0 });
  });

  it("throws when the new partner can't fulfill the order; caller transaction rollback leaves old partner's stock as if nothing happened", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_B, VARIANT_1, 1); // not enough for qty 4

    const lines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);

    // Simulate the real code path: this function is always invoked inside prisma.$transaction(...)
    // by the reassign route, so a mid-way throw must roll back everything it already did against
    // this same fake tx, mirroring what a real DB transaction would undo.
    const before = fakeDb.rows.map((r) => ({ ...r }));
    let threw = false;
    try {
      await reassignReservedPartnerStock({
        routedOrderId: "routed_1",
        oldPartnerId: PARTNER_A,
        newPartnerId: PARTNER_B,
        orderId: ORDER_1,
        orderStatus: "CREATED",
        lines,
        tx: fakeDb as any,
      });
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(InsufficientPartnerStockError);
      // Roll back what the (would-be) DB transaction rolled back, then assert nothing net changed.
      fakeDb.rows = before;
    }
    expect(threw).toBe(true);
    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 4 }); // untouched, as if reroute never happened
    expect(raw(PARTNER_B, VARIANT_1)).toEqual({ available: 1, reserved: 0 });
  });

  it("is a no-op when old and new partner are the same", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    const lines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);

    await reassignReservedPartnerStock({
      routedOrderId: "routed_1",
      oldPartnerId: PARTNER_A,
      newPartnerId: PARTNER_A,
      orderId: ORDER_1,
      orderStatus: "CREATED",
      lines,
      tx: fakeDb as any,
    });

    expect(raw(PARTNER_A, VARIANT_1)).toEqual({ available: 10, reserved: 4 });
  });

  it("tags both the released (old partner) and reserved (new partner) ledger rows with the given actor source", async () => {
    fakeDb.seedInventory(PARTNER_A, VARIANT_1, 10);
    fakeDb.seedInventory(PARTNER_B, VARIANT_1, 10);
    const lines = [{ variantId: VARIANT_1, quantity: 4 }];
    await reservePartnerStockForOrder(fakeDb as any, PARTNER_A, lines, ORDER_1);
    fakeDb.ledger = [];

    await reassignReservedPartnerStock({
      routedOrderId: "routed_1",
      oldPartnerId: PARTNER_A,
      newPartnerId: PARTNER_B,
      orderId: ORDER_1,
      orderStatus: "CREATED",
      lines,
      tx: fakeDb as any,
      notes: "Admin reassignment",
    });

    expect(fakeDb.ledger.length).toBeGreaterThan(0);
    expect(fakeDb.ledger.every((l) => l.notes === "Admin reassignment")).toBe(true);
    expect(fakeDb.ledger.some((l) => l.partnerId === PARTNER_A)).toBe(true);
    expect(fakeDb.ledger.some((l) => l.partnerId === PARTNER_B)).toBe(true);
  });
});
