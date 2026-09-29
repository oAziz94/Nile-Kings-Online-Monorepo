import { test, expect, type APIRequestContext } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { deleteByIds, safeWhere } from "./db-cleanup";

/**
 * Backlog 10.34 — notifications data + events. Seeds an admin, a partner pair (`seedPartnerPair`)
 * and a customer, places an order through the real storefront checkout API, has the admin assign
 * it to the fixture partner, has that partner cancel it, has the customer open a ticket, then
 * asserts the four write points each fired exactly once to the right recipient(s) via
 * `GET /api/notifications`, that `POST /api/notifications/read` flips `unreadCount`, and that a
 * partner cannot mark an admin's row read. Serial mode, one shared fixture set.
 *
 * Backlog 10.38 — also asserts the storefront checkout auto-assign case: the real Cairo
 * `ReroutingRule` partner that `place-order.ts` picks at order creation gets its
 * `order.assigned` row immediately (before any admin action), and that the admin's later
 * manual reassignment to the fixture partner does not add a second row for it.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const prisma = new PrismaClient();
const GOVERNORATE = "القاهرة";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(plain, salt);
  return `${salt}:${key.toString("hex")}`;
}

// Egyptian mobile format the phone validator accepts: "1" + one of [0125] + 8 digits (10 total).
// Built from the millisecond timestamp's last 7 digits, same shape as partner-fixtures.ts's
// uniqueLocalPhone, with distinct fixed tails so admin/customer/the timestamp collision is nil.
const TIMESTAMP_TAIL = String(Date.now()).slice(-7);
const ADMIN_PHONE = `+2010${TIMESTAMP_TAIL}0`;
const CUSTOMER_PHONE = `+2010${TIMESTAMP_TAIL}1`;
const PASSWORD = "NotifyTest123!";

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
let variantId: string;
let cairoPartnerId: string; // whichever real partner القاهرة's ReroutingRule already routes to
let orderId: string;
let ticketId: string;

// Backlog 10.38 — the real Cairo `ReroutingRule` partner (`cairoPartnerId`, above) has no
// linked `User` on this env (confirmed by direct query before writing this test), so it can
// never receive an `order.assigned` row and can't prove the checkout-auto-assign notify path.
// A dedicated fixture partner+user, inserted into the same rule at priority 0 (lower than the
// existing partners' null priority, so `getCachedPartnerIdForGovernorate` — cold on this
// freshly-started server — picks it first), stands in for that role only; the admin's
// reassignment in step 2 moves the order to `pair.agent` instead, so this partner is never
// touched again after checkout and its notification count is a clean "did checkout notify
// exactly once" signal.
let autoAssignUserId: string;
let autoAssignPartnerId: string;
let autoAssignRuleLinkId: string;
let cairoRuleId: string;

/** Logs in via the real API (not the UI form) and returns a request context carrying the
 * session cookie — every subsequent call from that context is authenticated as this user. */
async function apiLogin(request: APIRequestContext, phone: string, password: string) {
  const res = await request.post("/api/auth/login", { data: { phone, password } });
  expect(res.ok()).toBeTruthy();
}

test.beforeAll(async () => {
  const passwordHash = await hashPassword(PASSWORD);

  const admin = await prisma.user.create({
    data: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash, name: `مسؤول اختبار الإشعارات ${uniqueSuffix}` },
  });
  adminUserId = admin.id;

  const customer = await prisma.user.create({
    data: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash, name: `عميل اختبار الإشعارات ${uniqueSuffix}` },
  });
  customerUserId = customer.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة إشعارات ${uniqueSuffix}`, slug: `test-cat-notif-${uniqueSuffix}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج إشعارات ${uniqueSuffix}`, slug: `test-product-notif-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-NOTIF-${uniqueSuffix}`, name: "M", pricePiastres: 10000 },
  });
  variantId = variant.id;

  // Real checkout routes through القاهرة's existing ReroutingRule (seeded once per governorate,
  // per test-env.ts's doc comment) — not the fixture pair. Stock that real partner directly so
  // the storefront checkout call actually succeeds, and clean it up by variantId afterward
  // (this variant is freshly created, so that filter can never touch anyone else's stock).
  const rule = await prisma.reroutingRule.findFirst({
    where: { governorate: GOVERNORATE, isActive: true },
    include: {
      partners: {
        where: { isActive: true, partner: { isActive: true } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        select: { partnerId: true },
      },
    },
  });
  const resolvedPartnerId = rule?.partners[0]?.partnerId;
  if (!resolvedPartnerId) {
    throw new Error(`No active ReroutingRule/partner found for ${GOVERNORATE} — cannot seed a real checkout.`);
  }
  cairoPartnerId = resolvedPartnerId;
  cairoRuleId = rule!.id;

  await prisma.partnerInventory.create({
    data: { partnerId: cairoPartnerId, variantId, stockAvailable: 50, stockReserved: 0 },
  });

  // The admin later reassigns the order to the fixture agent partner (step 2 below) — it needs
  // its own stock of this same variant for that reassignment to commit cleanly.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 50, stockReserved: 0 },
  });

  // See the comment on `autoAssignPartnerId` above — a real, linked-user partner planted at
  // priority 0 in the same rule so checkout auto-assigns to it (not the userless real partner).
  const autoAssignPhone = `+2010${TIMESTAMP_TAIL}2`;
  const autoAssignUser = await prisma.user.create({
    data: { phone: autoAssignPhone, role: "CUSTOMER", passwordHash },
  });
  autoAssignUserId = autoAssignUser.id;
  const autoAssignPartner = await prisma.partner.create({
    data: {
      userId: autoAssignUserId,
      partnerType: "AGENT",
      name: `شريك التوجيه التلقائي ${uniqueSuffix}`,
      governorate: GOVERNORATE,
      phone: autoAssignPhone,
      isActive: true,
    },
  });
  autoAssignPartnerId = autoAssignPartner.id;
  await prisma.partnerInventory.create({
    data: { partnerId: autoAssignPartnerId, variantId, stockAvailable: 50, stockReserved: 0 },
  });
  // The rule-link itself is added inside the test (not here) through the real admin API, so
  // its `revalidateReroutingRules()` call actually busts `getCachedPartnerIdForGovernorate`'s
  // `unstable_cache` entry for القاهرة — a raw `prisma.reroutingRulePartner.create` here would
  // leave a dev server that already resolved this governorate once (e.g. a previous spec run
  // reusing the same server) serving its stale 300s-cached partner id.
});

test.afterAll(async () => {
  await deleteByIds(prisma.orderTicketMessage, [ticketId], "ticketId");
  await deleteByIds(prisma.orderTicket, [ticketId]);
  await deleteByIds(prisma.notification, [orderId, ticketId], "entityId");
  await deleteByIds(prisma.orderAuditLog, [orderId], "orderId");
  await deleteByIds(prisma.routedOrder, [orderId], "orderId");
  await deleteByIds(prisma.orderItem, [orderId], "orderId");
  await deleteByIds(prisma.order, [orderId]);
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ variantId }) });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId }) });
  await deleteByIds(prisma.variant, [variantId]);
  await deleteByIds(prisma.product, [productId]);
  await deleteByIds(prisma.category, [categoryId]);
  await cleanupPartnerPair(prisma, pair);
  // The 10.38 auto-assign fixture partner — its rule-link row first (FK), then the partner
  // and its user; this is our own row on the shared Cairo rule, added in beforeAll above.
  await deleteByIds(prisma.reroutingRulePartner, [autoAssignRuleLinkId]);
  await deleteByIds(prisma.partner, [autoAssignPartnerId]);
  await deleteByIds(prisma.user, [adminUserId, customerUserId, autoAssignUserId]);
  await prisma.$disconnect();
});

test("10.34 — order.created, order.assigned, order.cancelled_by_partner and ticket.created each fire exactly once, to the right recipients", async ({
  request,
}) => {
  // 0. Backlog 10.38 — plant the auto-assign fixture partner into القاهرة's rule at priority 0
  // through the real admin API (not a raw prisma insert), so its `revalidateReroutingRules()`
  // busts `getCachedPartnerIdForGovernorate`'s cache for this governorate before checkout runs.
  await apiLogin(request, ADMIN_PHONE, PASSWORD);
  const addPartnerRes = await request.post(`/api/admin/rerouting-rules/${cairoRuleId}/partners`, {
    data: { partnerId: autoAssignPartnerId, priority: 0 },
  });
  expect(addPartnerRes.ok()).toBeTruthy();
  autoAssignRuleLinkId = (await addPartnerRes.json()).data.id as string;

  // 1. Customer places a real order through the storefront checkout API.
  await apiLogin(request, CUSTOMER_PHONE, PASSWORD);
  const govRes = await request.post("/api/storefront/governorate", { data: { governorate: GOVERNORATE } });
  expect(govRes.ok()).toBeTruthy();

  const cartRes = await request.post("/api/cart/items", { data: { variantId, quantity: 1 } });
  expect(cartRes.ok()).toBeTruthy();

  const placeRes = await request.post("/api/checkout/place-order", {
    data: {
      address: {
        governorate: GOVERNORATE,
        city: "مدينة نصر",
        area: "الحي السابع",
        street: `شارع الاختبار ${uniqueSuffix}`,
        phone: "01000000000",
      },
      paymentMethod: "COD",
    },
  });
  expect(placeRes.ok()).toBeTruthy();
  const placed = (await placeRes.json()).data as { orderId: string };
  orderId = placed.orderId;
  expect(orderId).toBeTruthy();

  // 1b. Backlog 10.38 — the storefront checkout call above auto-assigned the order to
  // `autoAssignPartnerId` at creation (`place-order.ts`'s `selectedPartner`, resolved through
  // the priority-0 rule link seeded in `beforeAll`); that partner's user must already have
  // exactly one `order.assigned` row for this order, before any admin action (the route also
  // runs `assignOrderToGovernorate` right after `placeOrder`, which for an order that already
  // has an `assignedPartnerId` must only record a `RoutedOrder` and must not notify again).
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { assignedPartnerId: true } });
  expect(order?.assignedPartnerId).toBe(autoAssignPartnerId);
  const autoAssignNotifiedAfterCheckout = await prisma.notification.findMany({
    where: { userId: autoAssignUserId, kind: "order.assigned", entityId: orderId },
  });
  expect(autoAssignNotifiedAfterCheckout).toHaveLength(1);

  // 2. Admin assigns the order to the fixture agent partner (order.assigned).
  await apiLogin(request, ADMIN_PHONE, PASSWORD);
  const assignRes = await request.post(`/api/admin/orders/${orderId}/assign`, {
    data: { partnerId: pair.agent.partnerId },
  });
  expect(assignRes.ok()).toBeTruthy();

  // 2b. Reassigning to the fixture agent partner must not add a second `order.assigned` row
  // for the previously-assigned auto-assign partner (checked above) — the reassign path only
  // notifies the newly-assigned partner.
  const autoAssignNotifiedAfterReassign = await prisma.notification.findMany({
    where: { userId: autoAssignUserId, kind: "order.assigned", entityId: orderId },
  });
  expect(autoAssignNotifiedAfterReassign).toHaveLength(1);

  // 3. The agent partner cancels (order.cancelled_by_partner).
  await apiLogin(request, pair.agent.phone, pair.password);
  const cancelRes = await request.patch(`/api/partner/orders/${orderId}`, { data: { status: "CANCELLED" } });
  expect(cancelRes.ok()).toBeTruthy();

  // 4. The customer opens a ticket (ticket.created).
  await apiLogin(request, CUSTOMER_PHONE, PASSWORD);
  const ticketRes = await request.post(`/api/profile/orders/${orderId}/ticket`, {
    data: {
      subject: "DELIVERY_DELAY",
      body: "أين طلبي؟ لم يصل بعد وتأخر كثيرًا عن الموعد المتوقع.",
      contactPhone: "01000000000",
    },
  });
  expect(ticketRes.ok()).toBeTruthy();
  ticketId = (await ticketRes.json()).data.id as string;
  expect(ticketId).toBeTruthy();

  // 5. Admin sees exactly 3 rows for this order/ticket: created, cancelled, ticket.
  await apiLogin(request, ADMIN_PHONE, PASSWORD);
  const adminBeforeRes = await request.get("/api/notifications?filter=all&limit=50");
  expect(adminBeforeRes.ok()).toBeTruthy();
  const adminBefore = (await adminBeforeRes.json()).data as {
    items: { id: string; kind: string; entityId: string | null; readAt: string | null }[];
    unreadCount: number;
  };
  const adminRowsForThisRun = adminBefore.items.filter(
    (it) => it.entityId === orderId || it.entityId === ticketId
  );
  expect(adminRowsForThisRun).toHaveLength(3);
  expect(adminRowsForThisRun.map((r) => r.kind).sort()).toEqual(
    ["order.cancelled_by_partner", "order.created", "ticket.created"].sort()
  );
  expect(adminRowsForThisRun.every((r) => r.readAt === null)).toBe(true);

  // 6. The partner sees exactly 1 row (assigned), and cannot see or mark read the admin's rows.
  await apiLogin(request, pair.agent.phone, pair.password);
  const partnerRes = await request.get("/api/notifications?filter=all&limit=50");
  expect(partnerRes.ok()).toBeTruthy();
  const partnerData = (await partnerRes.json()).data as {
    items: { id: string; kind: string; entityId: string | null }[];
    unreadCount: number;
  };
  expect(partnerData.items).toHaveLength(1);
  expect(partnerData.items[0]).toMatchObject({ kind: "order.assigned", entityId: orderId });
  expect(partnerData.unreadCount).toBe(1);

  // A partner sending an admin's notification id to `read` is a no-op — the where clause is
  // scoped to the caller's own userId, so it never touches another user's row.
  const adminNotificationId = adminRowsForThisRun[0].id;
  const crossReadRes = await request.post("/api/notifications/read", { data: { ids: [adminNotificationId] } });
  expect(crossReadRes.ok()).toBeTruthy();
  const crossReadBody = (await crossReadRes.json()).data as { updated: number };
  expect(crossReadBody.updated).toBe(0);

  // 7. `read` flips `unreadCount` — mark the partner's own single row read.
  const partnerOwnId = partnerData.items[0].id;
  const partnerMarkRes = await request.post("/api/notifications/read", { data: { ids: [partnerOwnId] } });
  expect(partnerMarkRes.ok()).toBeTruthy();
  const partnerUnreadAfterRes = await request.get("/api/notifications/unread-count");
  const partnerUnreadAfter = (await partnerUnreadAfterRes.json()).data as { unreadCount: number };
  expect(partnerUnreadAfter.unreadCount).toBe(0);

  // 8. Confirm the admin's row the partner tried to mark is still unread (cross-user read never
  // applied), then mark it read as the admin themself and confirm unreadCount drops by exactly 1.
  await apiLogin(request, ADMIN_PHONE, PASSWORD);
  const adminUnreadBeforeRes = await request.get("/api/notifications/unread-count");
  const adminUnreadBefore = (await adminUnreadBeforeRes.json()).data as { unreadCount: number };
  expect(adminUnreadBefore.unreadCount).toBeGreaterThanOrEqual(3);

  const adminMarkRes = await request.post("/api/notifications/read", { data: { ids: [adminNotificationId] } });
  expect(adminMarkRes.ok()).toBeTruthy();
  const adminMarkBody = (await adminMarkRes.json()).data as { updated: number };
  expect(adminMarkBody.updated).toBe(1);

  const adminUnreadAfterRes = await request.get("/api/notifications/unread-count");
  const adminUnreadAfter = (await adminUnreadAfterRes.json()).data as { unreadCount: number };
  expect(adminUnreadAfter.unreadCount).toBe(adminUnreadBefore.unreadCount - 1);

  // 9. `filter=unread` excludes the row just marked read.
  const adminUnreadOnlyRes = await request.get("/api/notifications?filter=unread&limit=50");
  const adminUnreadOnly = (await adminUnreadOnlyRes.json()).data as { items: { id: string }[] };
  expect(adminUnreadOnly.items.some((it) => it.id === adminNotificationId)).toBe(false);
});

// Rework (verifier, pre-merge): `orderBy: { createdAt: "desc" }` alone gives no stable order
// for two rows sharing the exact same `createdAt` (bulk-assign notifies several partners
// inside one transaction, all with the same `createdAt`) — a plain cursor built on that
// ordering can repeat or skip a tied row across two paginated calls. `route.ts` now orders by
// `[{ createdAt: "desc" }, { id: "desc" }]`, a full order, so the cursor's position is
// unambiguous regardless of ties.
test("10.34 rework — cursor pagination is stable across identical createdAt values", async ({ request }) => {
  const tieCreatedAt = new Date("2024-01-01T00:00:00.000Z");
  const seededIds: string[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const row = await prisma.notification.create({
        data: {
          userId: customerUserId,
          kind: "ticket.created",
          title: `تعارض ترتيب متطابق الوقت ${i} — ${uniqueSuffix}`,
          href: "/profile/orders",
          createdAt: tieCreatedAt,
        },
      });
      seededIds.push(row.id);
    }

    // This customer has exactly these 3 notification rows (nothing else notifies a customer
    // in this release) — so filter=all with no other filter is scoped to exactly this set.
    await apiLogin(request, CUSTOMER_PHONE, PASSWORD);

    const page1Res = await request.get("/api/notifications?filter=all&limit=2");
    expect(page1Res.ok()).toBeTruthy();
    const page1 = (await page1Res.json()).data as { items: { id: string }[]; nextCursor: string | null };
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2Res = await request.get(`/api/notifications?filter=all&limit=2&cursor=${page1.nextCursor}`);
    expect(page2Res.ok()).toBeTruthy();
    const page2 = (await page2Res.json()).data as { items: { id: string }[]; nextCursor: string | null };
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    const page1Ids = page1.items.map((it) => it.id);
    const page2Ids = page2.items.map((it) => it.id);

    // Disjoint — no row repeated across the two pages.
    expect(page1Ids.some((id) => page2Ids.includes(id))).toBe(false);
    // Covers exactly the 3 seeded rows — none skipped, none duplicated, nothing extra.
    expect(new Set([...page1Ids, ...page2Ids])).toEqual(new Set(seededIds));

    // Repeating page 1 verbatim returns the identical set — the ordering is deterministic,
    // not merely "happened to work once".
    const page1AgainRes = await request.get("/api/notifications?filter=all&limit=2");
    const page1Again = (await page1AgainRes.json()).data as { items: { id: string }[] };
    expect(page1Again.items.map((it) => it.id)).toEqual(page1Ids);
  } finally {
    await deleteByIds(prisma.notification, seededIds);
  }
});
