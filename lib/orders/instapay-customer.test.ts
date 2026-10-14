/**
 * Backlog 10.50 — guards of the two customer InstaPay routes (`instapay-claimed` and `cancel`),
 * exercised through the real route handlers + the real `lib/orders/instapay-customer.ts`,
 * `releasePartnerReservation` and audit-log code against an in-memory fake Prisma layer (same
 * style as `partner-status-transition.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type OrderRow = {
  id: string;
  userId: string;
  status: string;
  paymentMethod: string;
  assignedPartnerId: string | null;
  cancellationReason: string | null;
  items: { variantId: string; quantity: number }[];
};
type AttemptRow = {
  id: string;
  orderId: string;
  provider: string;
  status: string;
  metadata: unknown;
  createdAt: Date;
};
type InventoryRow = { id: string; partnerId: string; variantId: string; stockAvailable: number; stockReserved: number };

class FakeDb {
  orders: OrderRow[] = [];
  attempts: AttemptRow[] = [];
  inventory: InventoryRow[] = [];
  ledger: { reason: string; reservedDelta: number; orderId?: string | null }[] = [];
  audit: { orderId: string; event: string; statusFrom?: string; statusTo?: string; details?: unknown }[] = [];

  reset() {
    this.orders = [];
    this.attempts = [];
    this.inventory = [];
    this.ledger = [];
    this.audit = [];
  }

  order = {
    findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
      const row = this.orders.find((o) => o.id === where.id && o.userId === where.userId);
      return row ? { ...row, items: row.items.map((i) => ({ ...i })) } : null;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: { status?: string; cancellationReason?: string | null };
    }) => {
      const row = this.orders.find((o) => o.id === where.id)!;
      if (data.status !== undefined) row.status = data.status;
      if (data.cancellationReason !== undefined) row.cancellationReason = data.cancellationReason;
      return row;
    },
  };

  paymentAttempt = {
    findFirst: async ({ where }: { where: { orderId: string; provider: string; status: string } }) => {
      const rows = this.attempts
        .filter((a) => a.orderId === where.orderId && a.provider === where.provider && a.status === where.status)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows[0] ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: { metadata: unknown } }) => {
      const row = this.attempts.find((a) => a.id === where.id)!;
      row.metadata = data.metadata;
      return row;
    },
  };

  partnerInventory = {
    findUnique: async ({ where }: { where: { partnerId_variantId: { partnerId: string; variantId: string } } }) => {
      const { partnerId, variantId } = where.partnerId_variantId;
      return this.inventory.find((r) => r.partnerId === partnerId && r.variantId === variantId) ?? null;
    },
    update: async ({ where, data }: { where: { id: string }; data: { stockReserved?: { decrement?: number } } }) => {
      const row = this.inventory.find((r) => r.id === where.id)!;
      if (data.stockReserved?.decrement !== undefined) row.stockReserved -= data.stockReserved.decrement;
      return row;
    },
  };

  inventoryLedger = {
    create: async ({ data }: { data: { reason: string; quantityReservedDelta?: number; reservedDelta?: number; orderId?: string | null } }) => {
      this.ledger.push({
        reason: data.reason,
        reservedDelta: data.quantityReservedDelta ?? data.reservedDelta ?? 0,
        orderId: data.orderId,
      });
      return data;
    },
  };

  orderAuditLog = {
    create: async ({ data }: { data: FakeDb["audit"][number] }) => {
      this.audit.push(data);
      return data;
    },
  };

  /** `SELECT "status" … FOR UPDATE` row lock used by `lockOrderAtStatus`. */
  $queryRaw = async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    const row = this.orders.find((o) => o.id === values[0]);
    return row ? [{ status: row.status }] : [];
  };

  $transaction = async (fn: (tx: this) => Promise<unknown>) => fn(this);
}

const fakeDb = new FakeDb();

vi.mock("@/lib/db", () => ({
  get prisma() {
    return fakeDb;
  },
}));

const session = vi.hoisted(() => ({ userId: "user_1" as string | null }));
vi.mock("@/lib/auth/session", () => ({
  requireCustomer: async () => {
    if (!session.userId) throw new Error("unauthorized");
    return { userId: session.userId };
  },
}));

const { POST: claim } = await import("@/app/api/checkout/orders/[id]/instapay-claimed/route");
const { POST: cancel } = await import("@/app/api/profile/orders/[id]/cancel/route");

const PARTNER = "partner_1";
const VARIANT = "variant_1";

function seed(over: Partial<OrderRow> = {}, attempt: Partial<AttemptRow> | null = {}) {
  fakeDb.orders.push({
    id: "order_1",
    userId: "user_1",
    status: "CREATED",
    paymentMethod: "INSTAPAY_PREPAID",
    assignedPartnerId: PARTNER,
    cancellationReason: null,
    items: [{ variantId: VARIANT, quantity: 2 }],
    ...over,
  });
  if (attempt) {
    fakeDb.attempts.push({
      id: "att_1",
      orderId: over.id ?? "order_1",
      provider: "INSTAPAY_PREPAID",
      status: "PENDING",
      metadata: null,
      createdAt: new Date(),
      ...attempt,
    });
  }
  fakeDb.inventory.push({ id: "inv_1", partnerId: PARTNER, variantId: VARIANT, stockAvailable: 10, stockReserved: 2 });
}

const call = (fn: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>, id = "order_1") =>
  fn(new Request("http://x/api"), { params: Promise.resolve({ id }) });

beforeEach(() => {
  fakeDb.reset();
  session.userId = "user_1";
});

describe("POST /api/checkout/orders/[id]/instapay-claimed", () => {
  it("401 when signed out", async () => {
    seed();
    session.userId = null;
    expect((await call(claim)).status).toBe(401);
  });

  it("404 for another customer's order (never reveals it exists)", async () => {
    seed({ userId: "someone_else" });
    expect((await call(claim)).status).toBe(404);
    expect(fakeDb.attempts[0].metadata).toBeNull();
  });

  it("409 for a non-InstaPay order and for an order that is no longer CREATED", async () => {
    seed({ paymentMethod: "COD" });
    expect((await call(claim)).status).toBe(409);
    fakeDb.reset();
    seed({ status: "CONFIRMED" });
    expect((await call(claim)).status).toBe(409);
    fakeDb.reset();
    seed({ status: "CANCELLED" });
    expect((await call(claim)).status).toBe(409);
  });

  it("409 when there is no PENDING InstaPay attempt", async () => {
    seed({}, { status: "CAPTURED" });
    expect((await call(claim)).status).toBe(409);
  });

  it("records customerClaimedAt on the PENDING attempt, keeping existing metadata", async () => {
    seed({}, { metadata: { note: "keep" } });
    const res = await call(claim);
    expect(res.status).toBe(200);
    const meta = fakeDb.attempts[0].metadata as { customerClaimedAt?: string; note?: string };
    expect(typeof meta.customerClaimedAt).toBe("string");
    expect(meta.note).toBe("keep");
    expect(((await res.json()).data as { customerClaimedAt: string }).customerClaimedAt).toBe(meta.customerClaimedAt);
  });

  it("is idempotent: a second claim keeps the first timestamp", async () => {
    seed();
    await call(claim);
    const first = (fakeDb.attempts[0].metadata as { customerClaimedAt: string }).customerClaimedAt;
    await new Promise((r) => setTimeout(r, 5));
    const res = await call(claim);
    expect(res.status).toBe(200);
    expect((fakeDb.attempts[0].metadata as { customerClaimedAt: string }).customerClaimedAt).toBe(first);
  });

  it("does not change the order's status or stock", async () => {
    seed();
    await call(claim);
    expect(fakeDb.orders[0].status).toBe("CREATED");
    expect(fakeDb.inventory[0].stockReserved).toBe(2);
  });
});

describe("POST /api/profile/orders/[id]/cancel", () => {
  it("401 when signed out", async () => {
    seed();
    session.userId = null;
    expect((await call(cancel)).status).toBe(401);
    expect(fakeDb.orders[0].status).toBe("CREATED");
  });

  it("404 for another customer's order, nothing released", async () => {
    seed({ userId: "someone_else" });
    expect((await call(cancel)).status).toBe(404);
    expect(fakeDb.orders[0].status).toBe("CREATED");
    expect(fakeDb.inventory[0].stockReserved).toBe(2);
  });

  it("409 for COD orders, non-CREATED orders and already-cancelled orders; nothing released", async () => {
    for (const over of [{ paymentMethod: "COD" }, { status: "CONFIRMED" }, { status: "CANCELLED" }]) {
      fakeDb.reset();
      seed(over);
      expect((await call(cancel)).status).toBe(409);
      expect(fakeDb.inventory[0].stockReserved).toBe(2);
      expect(fakeDb.audit).toHaveLength(0);
    }
  });

  it("409 when the PaymentAttempt is no longer PENDING (payment already captured)", async () => {
    seed({}, { status: "CAPTURED" });
    expect((await call(cancel)).status).toBe(409);
    expect(fakeDb.orders[0].status).toBe("CREATED");
    expect(fakeDb.inventory[0].stockReserved).toBe(2);
  });

  it("cancels: releases the reservation, audits as customer, sets cancellationReason", async () => {
    seed();
    const res = await call(cancel);
    expect(res.status).toBe(200);
    expect(fakeDb.orders[0].status).toBe("CANCELLED");
    expect(fakeDb.orders[0].cancellationReason).toBe("customer");
    expect(fakeDb.inventory[0].stockReserved).toBe(0);
    expect(fakeDb.inventory[0].stockAvailable).toBe(10);
    expect(fakeDb.ledger).toEqual([{ reason: "ORDER_RELEASE", reservedDelta: -2, orderId: "order_1" }]);
    expect(fakeDb.audit).toEqual([
      {
        orderId: "order_1",
        event: "cancelled",
        statusFrom: "CREATED",
        statusTo: "CANCELLED",
        details: { cancellationReason: "customer" },
      },
    ]);
  });

  it("a second cancel is 409 and releases nothing more", async () => {
    seed();
    expect((await call(cancel)).status).toBe(200);
    expect((await call(cancel)).status).toBe(409);
    expect(fakeDb.inventory[0].stockReserved).toBe(0);
    expect(fakeDb.audit).toHaveLength(1);
  });
});
