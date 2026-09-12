/**
 * Unit tests for the extracted status-transition module (backlog 4.19), against an
 * in-memory fake Prisma layer — same style as `lib/inventory/partner-inventory.test.ts`
 * (no real DB, no mocked business logic: the real `commitPartnerReservation` /
 * `releasePartnerReservation` / `restorePartnerCommittedStock` / audit-log functions all
 * run against the fake). Exercises every branch preserved from the legacy
 * `app/api/partner/orders/[id]/route.ts` PATCH handler: generic status change, leaving
 * CREATED (stock commit + InstaPay capture + audit), cancellation (release vs. restore
 * depending on prior status), the two 400s, and the 404.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type InventoryRow = {
  id: string;
  partnerId: string;
  variantId: string;
  stockAvailable: number;
  stockReserved: number;
};

type OrderRow = {
  id: string;
  status: string;
  assignedPartnerId: string;
  paymentMethod: string;
  adminNotes: string | null;
  cancellationReason: string | null;
  reservationExpiresAt: Date | null;
  items: { variantId: string; quantity: number }[];
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

type AuditRow = {
  orderId: string;
  event: string;
  statusFrom?: string;
  statusTo?: string;
  details?: unknown;
};

type PaymentAttemptRow = { orderId: string; status: string };

type IncDec = { increment?: number; decrement?: number };
type OrderUpdateData = {
  status?: string;
  adminNotes?: string | null;
  cancellationReason?: string | null;
  reservationExpiresAt?: Date | null;
};
type InventoryUpdateData = { stockReserved?: IncDec; stockAvailable?: IncDec };
type InventoryUpsertArgs = {
  where: { partnerId_variantId: { partnerId: string; variantId: string } };
  update: { stockAvailable?: { increment?: number }; stockReserved?: { increment?: number } };
  create: { stockAvailable: number; stockReserved: number };
};

class FakeDb {
  orders: OrderRow[] = [];
  inventory: InventoryRow[] = [];
  ledger: LedgerRow[] = [];
  audit: AuditRow[] = [];
  paymentAttempts: PaymentAttemptRow[] = [];
  private seq = 0;

  seedOrder(order: Partial<OrderRow> & { id: string; assignedPartnerId: string }) {
    this.orders.push({
      status: "CREATED",
      paymentMethod: "COD",
      adminNotes: null,
      cancellationReason: null,
      reservationExpiresAt: null,
      items: [],
      ...order,
    });
  }

  seedInventory(partnerId: string, variantId: string, stockAvailable: number, stockReserved = 0) {
    this.inventory.push({ id: `row_${++this.seq}`, partnerId, variantId, stockAvailable, stockReserved });
  }

  private findInventory(partnerId: string, variantId: string) {
    return this.inventory.find((r) => r.partnerId === partnerId && r.variantId === variantId);
  }

  order = {
    findFirst: async ({ where }: { where: { id: string; assignedPartnerId: string } }) => {
      const row = this.orders.find((o) => o.id === where.id && o.assignedPartnerId === where.assignedPartnerId);
      return row ? { ...row, items: row.items.map((i) => ({ ...i })) } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: OrderUpdateData }) => {
      const row = this.orders.find((o) => o.id === where.id);
      if (!row) throw new Error("order not found");
      if (data.status !== undefined) row.status = data.status;
      if (data.adminNotes !== undefined) row.adminNotes = data.adminNotes;
      if (data.cancellationReason !== undefined) row.cancellationReason = data.cancellationReason;
      if (data.reservationExpiresAt !== undefined) row.reservationExpiresAt = data.reservationExpiresAt;
      return { ...row, items: row.items.map((i) => ({ ...i })) };
    },
  };

  partnerInventory = {
    findMany: async ({ where }: { where: { partnerId: string; variantId?: { in: string[] } } }) => {
      const variantIds = where.variantId?.in;
      return this.inventory.filter(
        (r) => r.partnerId === where.partnerId && (!variantIds || variantIds.includes(r.variantId))
      );
    },
    findUnique: async ({ where }: { where: { partnerId_variantId: { partnerId: string; variantId: string } } }) => {
      const { partnerId, variantId } = where.partnerId_variantId;
      return this.findInventory(partnerId, variantId) ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: InventoryUpdateData }) => {
      const row = this.inventory.find((r) => r.id === where.id);
      if (!row) throw new Error("row not found");
      if (data.stockReserved?.decrement !== undefined) row.stockReserved -= data.stockReserved.decrement;
      if (data.stockReserved?.increment !== undefined) row.stockReserved += data.stockReserved.increment;
      if (data.stockAvailable?.increment !== undefined) row.stockAvailable += data.stockAvailable.increment;
      if (data.stockAvailable?.decrement !== undefined) row.stockAvailable -= data.stockAvailable.decrement;
      return row;
    },
    upsert: async ({ where, update, create }: InventoryUpsertArgs) => {
      const { partnerId, variantId } = where.partnerId_variantId;
      const existing = this.findInventory(partnerId, variantId);
      if (existing) {
        if (update.stockAvailable?.increment !== undefined) existing.stockAvailable += update.stockAvailable.increment;
        if (update.stockReserved?.increment !== undefined) existing.stockReserved += update.stockReserved.increment;
        return existing;
      }
      const row: InventoryRow = { id: `row_${++this.seq}`, partnerId, variantId, ...create };
      this.inventory.push(row);
      return row;
    },
  };

  inventoryLedger = {
    create: async ({ data }: { data: LedgerRow }) => {
      this.ledger.push(data);
      return data;
    },
    createMany: async ({ data }: { data: LedgerRow[] }) => {
      this.ledger.push(...data);
      return { count: data.length };
    },
  };

  orderAuditLog = {
    create: async ({ data }: { data: AuditRow }) => {
      this.audit.push(data);
      return data;
    },
  };

  paymentAttempt = {
    updateMany: async ({
      where,
      data,
    }: {
      where: { orderId: string; status: string };
      data: { status: string };
    }) => {
      const rows = this.paymentAttempts.filter((p) => p.orderId === where.orderId && p.status === where.status);
      for (const row of rows) row.status = data.status;
      return { count: rows.length };
    },
  };

  /** Reproduces the FOR UPDATE lock + the two raw UPDATE statements used by partner-inventory.ts (unused by this module directly, kept for parity with the sibling fake). */
  $executeRaw = async (query: { sql: string; values: unknown[] }) => {
    const sql: string = query.sql;
    const values: unknown[] = query.values;
    if (sql.includes("FOR UPDATE")) return 0;
    const isReserve = sql.includes(`"stockReserved" = pi."stockReserved" + v.qty`);
    const isCommit = sql.includes(`"stockAvailable" = pi."stockAvailable" - v.qty`);
    if (!isReserve && !isCommit) throw new Error(`FakeDb: unrecognized raw query: ${sql}`);
    const partnerId = values[values.length - 1] as string;
    for (let i = 0; i < values.length - 1; i += 2) {
      const variantId = values[i] as string;
      const qty = values[i + 1] as number;
      const row = this.findInventory(partnerId, variantId);
      if (!row) continue;
      if (isReserve) row.stockReserved += qty;
      if (isCommit) {
        row.stockAvailable -= qty;
        row.stockReserved -= qty;
      }
    }
    return 1;
  };

  $transaction = async (fn: (tx: this) => Promise<unknown>) => fn(this);
}

const fakeDb = new FakeDb();

vi.mock("@/lib/db", () => ({
  get prisma() {
    return fakeDb;
  },
}));

const { transitionPartnerOrderStatus, PartnerOrderTransitionError } = await import("./partner-status-transition");

const PARTNER = "partner_1";
const VARIANT_1 = "variant_1";
const ORDER_1 = "order_1";

beforeEach(() => {
  fakeDb.orders = [];
  fakeDb.inventory = [];
  fakeDb.ledger = [];
  fakeDb.audit = [];
  fakeDb.paymentAttempts = [];
});

describe("transitionPartnerOrderStatus — generic status change", () => {
  it("logs a status_change audit entry and updates status, with no stock/payment side effects", async () => {
    fakeDb.seedOrder({ id: ORDER_1, assignedPartnerId: PARTNER, status: "PROCESSING" });

    const order = await transitionPartnerOrderStatus({
      partnerId: PARTNER,
      orderId: ORDER_1,
      nextStatus: "READY_TO_SHIP",
    });

    expect(order.status).toBe("READY_TO_SHIP");
    expect(fakeDb.audit).toEqual([
      { orderId: ORDER_1, event: "status_change", statusFrom: "PROCESSING", statusTo: "READY_TO_SHIP" },
    ]);
    expect(fakeDb.ledger).toHaveLength(0);
  });

  it("merges adminNotes into the same update (trims, empty string -> null)", async () => {
    fakeDb.seedOrder({ id: ORDER_1, assignedPartnerId: PARTNER, status: "PROCESSING" });

    const order = await transitionPartnerOrderStatus({
      partnerId: PARTNER,
      orderId: ORDER_1,
      nextStatus: "READY_TO_SHIP",
      adminNotes: "  ملاحظة  ",
    });
    expect(order.adminNotes).toBe("ملاحظة");
  });

  it("does not log an audit entry when the status is unchanged", async () => {
    fakeDb.seedOrder({ id: ORDER_1, assignedPartnerId: PARTNER, status: "PROCESSING" });
    await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "PROCESSING" });
    expect(fakeDb.audit).toHaveLength(0);
  });
});

describe("transitionPartnerOrderStatus — leaving CREATED", () => {
  it("commits the partner's reservation, clears reservationExpiresAt, and logs 'confirmed' for CONFIRMED", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 10, 3);
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CREATED",
      reservationExpiresAt: new Date(),
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });

    const order = await transitionPartnerOrderStatus({
      partnerId: PARTNER,
      orderId: ORDER_1,
      nextStatus: "CONFIRMED",
    });

    expect(order.status).toBe("CONFIRMED");
    expect(order.reservationExpiresAt).toBeNull();
    const inv = fakeDb.inventory.find((r) => r.variantId === VARIANT_1)!;
    expect(inv).toMatchObject({ stockAvailable: 7, stockReserved: 0 });
    expect(fakeDb.audit).toEqual([{ orderId: ORDER_1, event: "confirmed", statusFrom: "CREATED", statusTo: "CONFIRMED" }]);
  });

  it("logs a generic status_change (not 'confirmed') when the target is not CONFIRMED", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 10, 3);
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CREATED",
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });

    await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "PROCESSING" });

    expect(fakeDb.audit).toEqual([
      { orderId: ORDER_1, event: "status_change", statusFrom: "CREATED", statusTo: "PROCESSING" },
    ]);
  });

  it("captures PENDING InstaPay payment attempts to CAPTURED", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 10, 3);
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CREATED",
      paymentMethod: "INSTAPAY_PREPAID",
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });
    fakeDb.paymentAttempts.push({ orderId: ORDER_1, status: "PENDING" });

    await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CONFIRMED" });

    expect(fakeDb.paymentAttempts[0].status).toBe("CAPTURED");
  });

  it("does not touch payment attempts for non-InstaPay orders", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 10, 3);
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CREATED",
      paymentMethod: "COD",
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });
    fakeDb.paymentAttempts.push({ orderId: ORDER_1, status: "PENDING" });

    await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CONFIRMED" });

    expect(fakeDb.paymentAttempts[0].status).toBe("PENDING");
  });

  it("throws the exact 400 message when the partner's stock can't cover the commit, and leaves status unchanged", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 10, 1); // only 1 reserved, order needs 3
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CREATED",
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });

    await expect(
      transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CONFIRMED" })
    ).rejects.toThrow("كمية غير متوفرة في مخزون الشريك لتأكيد الطلب");

    expect(fakeDb.orders[0].status).toBe("CREATED");
  });
});

describe("transitionPartnerOrderStatus — cancellation", () => {
  it("releases reservation-only stock when cancelling from CREATED", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 10, 3);
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CREATED",
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });

    const order = await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CANCELLED" });

    expect(order.status).toBe("CANCELLED");
    expect(order.cancellationReason).toBe("partner_agent");
    const inv = fakeDb.inventory.find((r) => r.variantId === VARIANT_1)!;
    expect(inv).toMatchObject({ stockAvailable: 10, stockReserved: 0 });
    expect(fakeDb.audit).toEqual([
      { orderId: ORDER_1, event: "cancelled", statusFrom: "CREATED", statusTo: "CANCELLED", details: { cancellationReason: "partner_agent" } },
    ]);
  });

  it("restores committed stock when cancelling a post-CREATED order", async () => {
    fakeDb.seedInventory(PARTNER, VARIANT_1, 7, 0); // already committed (available already decremented)
    fakeDb.seedOrder({
      id: ORDER_1,
      assignedPartnerId: PARTNER,
      status: "CONFIRMED",
      items: [{ variantId: VARIANT_1, quantity: 3 }],
    });

    await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CANCELLED" });

    const inv = fakeDb.inventory.find((r) => r.variantId === VARIANT_1)!;
    expect(inv).toMatchObject({ stockAvailable: 10, stockReserved: 0 });
  });

  it("is a no-op stock-wise (and does not double-log) when the order is already CANCELLED", async () => {
    fakeDb.seedOrder({ id: ORDER_1, assignedPartnerId: PARTNER, status: "CANCELLED" });
    const order = await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CANCELLED" });
    expect(order.status).toBe("CANCELLED");
    expect(fakeDb.audit).toHaveLength(0);
  });
});

describe("transitionPartnerOrderStatus — validation", () => {
  it("throws 'حالة الطلب غير صالحة' for an unrecognised status", async () => {
    fakeDb.seedOrder({ id: ORDER_1, assignedPartnerId: PARTNER, status: "CREATED" });
    await expect(
      transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "NOT_A_STATUS" })
    ).rejects.toThrow("حالة الطلب غير صالحة");
  });

  it("throws 'الطلب غير موجود' with a 404 status when the order doesn't belong to this partner (or doesn't exist)", async () => {
    fakeDb.seedOrder({ id: ORDER_1, assignedPartnerId: "someone_else" });
    const err = await transitionPartnerOrderStatus({ partnerId: PARTNER, orderId: ORDER_1, nextStatus: "CONFIRMED" }).catch(
      (e) => e
    );
    expect(err).toBeInstanceOf(PartnerOrderTransitionError);
    expect(err.message).toBe("الطلب غير موجود");
    expect(err.status).toBe(404);
  });
});
