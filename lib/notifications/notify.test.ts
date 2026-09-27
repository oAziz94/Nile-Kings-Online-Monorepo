/**
 * Unit tests for the notifications dispatcher (backlog 10.34 b/f): recipient resolution for
 * both audience shapes, and that `notify()` writes exactly one row per resolved recipient with
 * the fields the write points pass through untouched.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { notify, resolveRecipientIds } from "./notify";

type NotificationRow = {
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  entityType: string | null;
  entityId: string | null;
};

class FakeTx {
  users: { id: string; role: string }[] = [];
  created: NotificationRow[] = [];

  user = {
    findMany: async ({ where }: { where: { role: string } }) => {
      return this.users.filter((u) => u.role === where.role).map((u) => ({ id: u.id }));
    },
  };

  notification = {
    createMany: async ({ data }: { data: NotificationRow[] }) => {
      this.created.push(...data);
      return { count: data.length };
    },
  };
}

let tx: FakeTx;

beforeEach(() => {
  tx = new FakeTx();
});

describe("resolveRecipientIds", () => {
  it("\"admins\" resolves to every ADMIN user's id, no others", async () => {
    tx.users = [
      { id: "admin_1", role: "ADMIN" },
      { id: "admin_2", role: "ADMIN" },
      { id: "partner_1", role: "PARTNER" },
      { id: "customer_1", role: "CUSTOMER" },
    ];
    const ids = await resolveRecipientIds(tx as never, "admins");
    expect(ids.sort()).toEqual(["admin_1", "admin_2"]);
  });

  it("{ userId } resolves to exactly that one id, without touching the db", async () => {
    const ids = await resolveRecipientIds(tx as never, { userId: "user_42" });
    expect(ids).toEqual(["user_42"]);
  });

  it("\"admins\" resolves to an empty list when there are no ADMIN users", async () => {
    tx.users = [{ id: "customer_1", role: "CUSTOMER" }];
    const ids = await resolveRecipientIds(tx as never, "admins");
    expect(ids).toEqual([]);
  });
});

describe("notify", () => {
  it("writes one row per admin, with the kind/title/body/href/entity passed through", async () => {
    tx.users = [
      { id: "admin_1", role: "ADMIN" },
      { id: "admin_2", role: "ADMIN" },
    ];

    await notify(tx as never, {
      audience: "admins",
      kind: "order.created",
      title: "طلب جديد #12345678 · القاهرة · 100.00 ج.م",
      body: "تفاصيل",
      href: "/admin/orders/12345678",
      entity: { type: "order", id: "order_1" },
    });

    expect(tx.created).toHaveLength(2);
    expect(tx.created.map((r) => r.userId).sort()).toEqual(["admin_1", "admin_2"]);
    for (const row of tx.created) {
      expect(row).toMatchObject({
        kind: "order.created",
        title: "طلب جديد #12345678 · القاهرة · 100.00 ج.م",
        body: "تفاصيل",
        href: "/admin/orders/12345678",
        entityType: "order",
        entityId: "order_1",
      });
    }
  });

  it("writes exactly one row for a single-user audience", async () => {
    await notify(tx as never, {
      audience: { userId: "partner_user_1" },
      kind: "order.assigned",
      title: "طلب جديد #12345678 · الحي السابع · 3 قطع",
      href: "/partner/orders/12345678",
      entity: { type: "order", id: "order_1" },
    });

    expect(tx.created).toHaveLength(1);
    expect(tx.created[0]).toMatchObject({ userId: "partner_user_1", kind: "order.assigned" });
  });

  it("defaults an omitted body to null, never undefined, so it round-trips through Prisma", async () => {
    await notify(tx as never, {
      audience: { userId: "u1" },
      kind: "ticket.created",
      title: "سؤال جديد على الطلب #12345678",
      href: "/admin/order-tickets/t1",
    });
    expect(tx.created[0].body).toBeNull();
    expect(tx.created[0].entityType).toBeNull();
    expect(tx.created[0].entityId).toBeNull();
  });

  it("is a no-op (no createMany call at all) when the audience resolves to zero recipients", async () => {
    tx.users = []; // no ADMIN rows
    await notify(tx as never, {
      audience: "admins",
      kind: "ticket.created",
      title: "سؤال جديد على الطلب #12345678",
      href: "/admin/order-tickets/t1",
    });
    expect(tx.created).toHaveLength(0);
  });
});
