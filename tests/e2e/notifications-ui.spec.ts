import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { test, expect, type Page, type Locator } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { deleteByIds, safeWhere } from "./db-cleanup";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 10.35 — notifications v1, UI. Row data comes straight from `prisma.notification`
 * (10.34's dispatcher/write-points are already covered by `notifications-api.spec.ts`); this
 * spec only drives the bell/history-page UI against seeded rows: badge count, popover tabs,
 * click-to-read + navigate, mark-all, and history-page pagination — for both dashboards.
 *
 * Serial, one shared admin + one shared partner pair, so later tests build on state earlier
 * ones left behind (e.g. the pagination test reuses the rows the bell tests read).
 *
 * `DashboardShell` mounts the bell twice (mobile top bar + desktop topbar, one hidden by CSS
 * per breakpoint, never unmounted) — `bellButton()` filters to the one Playwright's `:visible`
 * pseudo-class considers displayed, so it resolves to exactly one element at any viewport.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const prisma = new PrismaClient();
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function bellButton(page: Page): Locator {
  return page.locator('button[aria-label*="الإشعارات"]:visible');
}

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

const ADMIN_PHONE = `+2010${String(Date.now()).slice(-7)}2`;
const ADMIN_PASSWORD = "NotifUiAdmin123!";
const CUSTOMER_PHONE = `+2010${String(Date.now()).slice(-7)}3`;

let adminUserId: string;
let customerUserId: string;
let tickOrderId: string;
let tickTicketId: string | undefined;
let capAdminUserId: string | undefined;
let pair: PartnerFixturePair;
const ADMIN_UNREAD_COUNT = 22;
const ADMIN_READ_COUNT = 3;
const ADMIN_TOTAL = ADMIN_UNREAD_COUNT + ADMIN_READ_COUNT;
const PARTNER_UNREAD_COUNT = 3;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: `مسؤول اختبار الإشعارات ${uniqueSuffix}` },
  });
  adminUserId = admin.id;

  pair = await seedPartnerPair(prisma);

  // Backlog 10.52 — a customer + one order for the real-path poll-tick test (the customer
  // opens a ticket through the app, which `notify()`s every admin, including this one).
  const customer = await prisma.user.create({
    data: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword(ADMIN_PASSWORD), name: `عميل اختبار الإشعارات ${uniqueSuffix}` },
  });
  customerUserId = customer.id;
  const tickOrder = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CONFIRMED",
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", street: "شارع الاختبار", phone: CUSTOMER_PHONE },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
    },
  });
  tickOrderId = tickOrder.id;

  // Admin: 22 unread + 3 already-read = 25 rows, enough to exercise the history page's
  // cursor pagination (limit 20) and give the "unread" tab its own hasMore state.
  const now = Date.now();
  for (let i = 0; i < ADMIN_UNREAD_COUNT; i += 1) {
    await prisma.notification.create({
      data: {
        userId: adminUserId,
        kind: "order.created",
        title: `طلب جديد #TESTORD${uniqueSuffix}${i} · القاهرة · 250 ج.م`,
        body: null,
        href: `/admin/orders/notif-test-${uniqueSuffix}-${i}`,
        entityType: "order",
        entityId: `notif-test-${uniqueSuffix}-${i}`,
        createdAt: new Date(now - i * 1000),
      },
    });
  }
  // Newer than every unread row (not older) — otherwise they'd fall past the popover's
  // latest-15 window and the "الكل" tab/page's first page, since both order by `createdAt desc`.
  for (let i = 0; i < ADMIN_READ_COUNT; i += 1) {
    await prisma.notification.create({
      data: {
        userId: adminUserId,
        kind: "ticket.created",
        title: `سؤال جديد على الطلب #TESTTIX${uniqueSuffix}${i}`,
        body: null,
        href: `/admin/order-tickets/notif-test-tix-${uniqueSuffix}-${i}`,
        entityType: "ticket",
        entityId: `notif-test-tix-${uniqueSuffix}-${i}`,
        readAt: new Date(),
        createdAt: new Date(now + (ADMIN_READ_COUNT - i) * 1000),
      },
    });
  }

  // Partner (the fixture agent): 3 unread `order.assigned` rows.
  for (let i = 0; i < PARTNER_UNREAD_COUNT; i += 1) {
    await prisma.notification.create({
      data: {
        userId: pair.agent.userId,
        kind: "order.assigned",
        title: `طلب جديد #TESTPART${uniqueSuffix}${i} · الجيزة · 2 قطعة`,
        body: null,
        href: `/partner/orders/notif-test-partner-${uniqueSuffix}-${i}`,
        entityType: "order",
        entityId: `notif-test-partner-${uniqueSuffix}-${i}`,
        createdAt: new Date(now - i * 1000),
      },
    });
  }
});

test.afterAll(async () => {
  await deleteByIds(prisma.notification, [capAdminUserId], "userId");
  await deleteByIds(prisma.user, [capAdminUserId]);
  await prisma.notification.deleteMany({ where: safeWhere({ userId: { in: [adminUserId, pair.agent.userId] } }) });
  // 10.52 — the ticket's notification rows for any OTHER admin were written by the app path and
  // carry the ticket id as entityId; remove exactly those, then the ticket/order/customer.
  await deleteByIds(prisma.notification, [tickTicketId], "entityId");
  await deleteByIds(prisma.orderTicketMessage, [tickTicketId], "ticketId");
  await deleteByIds(prisma.orderTicket, [tickTicketId]);
  await deleteByIds(prisma.order, [tickOrderId]);
  await deleteByIds(prisma.user, [customerUserId]);
  await cleanupPartnerPair(prisma, pair);
  await deleteByIds(prisma.user, [adminUserId]);
  await prisma.$disconnect();
});

test("10.39 — reopening the bell shows a row created after the first open, without a reload", async ({ page }) => {
  await loginAsAdmin(page);
  const bell = bellButton(page);

  // First open: caches the list.
  await bell.click();
  await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}0`)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "الكل" })).toBeHidden();

  // A new notification lands while the popover is closed (the live glitch: badge polls, list didn't).
  const lateTitle = `طلب جديد #TESTLATE${uniqueSuffix} · الجيزة · 300 ج.م`;
  await prisma.notification.create({
    data: {
      userId: adminUserId,
      kind: "order.created",
      title: lateTitle,
      body: null,
      href: `/admin/orders/notif-late-${uniqueSuffix}`,
      entityType: "order",
      entityId: `notif-late-${uniqueSuffix}`,
      createdAt: new Date(),
    },
  });

  await bustBadgeCache(page);

  // Reopen without reloading: the list must be fetched fresh and include the new row.
  await bell.click();
  await expect(page.getByText(lateTitle)).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Escape");

  // Remove it again so the seeded counts the following tests assert on are unchanged.
  await prisma.notification.deleteMany({ where: safeWhere({ userId: adminUserId, entityId: `notif-late-${uniqueSuffix}` }) });
  await bustBadgeCache(page);
});

// Backlog 10.52 — the unread count is answered from a Redis cache (up to 15 min) that only
// application writes invalidate. These tests change rows straight through Prisma, so after each
// such write they call the real `POST /api/notifications/read` with an id that matches nothing:
// the route's normal behaviour (mark dirty + drop the cached count) invalidates the badge, and
// no production code has a test-only bypass.
async function bustBadgeCache(page: Page) {
  const res = await page.request.post("/api/notifications/read", { data: { ids: [`nonexistent-${uniqueSuffix}`] } });
  expect(res.ok()).toBeTruthy();
}

// Backlog 10.40 — the owner still had to reload after 10.39: the badge only polled (paused while
// the tab was hidden, no refetch on return), opening the bell refreshed the list but not the
// badge, and the history page fetched once. Each test below expects the update within 5 s,
// well under the 20 s poll, so it can only pass through the focus / open refetch paths.
async function insertLateRow(page: Page, tag: string) {
  const entityId = `notif-live-${tag}-${uniqueSuffix}`;
  const title = `طلب جديد #TESTLIVE${tag}${uniqueSuffix} · الجيزة · 300 ج.م`;
  await prisma.notification.create({
    data: { userId: adminUserId, kind: "order.created", title, body: null, href: `/admin/orders/${entityId}`, entityType: "order", entityId },
  });
  await bustBadgeCache(page);
  return { entityId, title };
}
async function removeLateRow(page: Page, entityId: string) {
  await prisma.notification.deleteMany({ where: safeWhere({ userId: adminUserId, entityId }) });
  await bustBadgeCache(page);
}
async function simulateTabReturn(page: Page) {
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    window.dispatchEvent(new Event("focus"));
  });
}

test("10.40 — returning to the tab refreshes the badge without a reload", async ({ page }) => {
  await loginAsAdmin(page);
  const bell = bellButton(page);
  await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT} غير مقروء)`);

  const late = await insertLateRow(page, "focus");
  try {
    await simulateTabReturn(page);
    await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT + 1} غير مقروء)`, { timeout: 5_000 });
  } finally {
    await removeLateRow(page, late.entityId);
  }
});

test("10.40 — opening the bell refreshes the badge and shows the new row", async ({ page }) => {
  await loginAsAdmin(page);
  const bell = bellButton(page);
  await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT} غير مقروء)`);

  const late = await insertLateRow(page, "open");
  try {
    await bell.click();
    await expect(page.getByText(late.title)).toBeVisible({ timeout: 5_000 });
    await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT + 1} غير مقروء)`, { timeout: 5_000 });
    await page.keyboard.press("Escape");
  } finally {
    await removeLateRow(page, late.entityId);
  }
});

test("10.40 — the history page shows a new row without a reload", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/notifications");
  await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}0`)).toBeVisible();

  const late = await insertLateRow(page, "history");
  try {
    await simulateTabReturn(page);
    await expect(page.getByText(late.title)).toBeVisible({ timeout: 5_000 });
  } finally {
    await removeLateRow(page, late.entityId);
  }
});

test("10.52 — a ticket opened by a customer reaches the admin badge on a poll tick, with no interaction", async ({ page, playwright, baseURL }) => {
  await loginAsAdmin(page);
  const bell = bellButton(page);
  await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT} غير مقروء)`);

  // A real application path: the customer's ticket POST runs `notify()` for every admin, which
  // marks the Redis cache dirty. No page interaction from here on — only the 20 s poll can move
  // the badge (it must still poll under the idle-pause logic, and must not serve a stale cache).
  const customerApi = await playwright.request.newContext({ baseURL });
  try {
    const login = await customerApi.post("/api/auth/login", { data: { phone: CUSTOMER_PHONE, password: ADMIN_PASSWORD } });
    expect(login.ok()).toBeTruthy();
    const ticketRes = await customerApi.post(`/api/profile/orders/${tickOrderId}/ticket`, {
      data: { subject: "DELIVERY_DELAY", body: "أين طلبي؟ لم يصل بعد وتأخر كثيرًا عن الموعد المتوقع.", contactPhone: "01000000000" },
    });
    expect(ticketRes.ok()).toBeTruthy();
    tickTicketId = (await ticketRes.json()).data.id as string;
  } finally {
    await customerApi.dispose();
  }

  await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT + 1} غير مقروء)`, { timeout: 35_000 });

  // Put the admin's state back for the tests that follow: remove the ticket's row for this
  // admin (the ticket itself is removed in afterAll) and invalidate the cached count.
  await prisma.notification.deleteMany({ where: safeWhere({ userId: adminUserId, entityId: tickTicketId }) });
  await bustBadgeCache(page);
});

test("admin bell: badge matches unread count, popover lists seeded rows", async ({ page }) => {
  await loginAsAdmin(page);

  const countRes = await page.request.get("/api/notifications/unread-count");
  expect((await countRes.json()).data.unreadCount).toBe(ADMIN_UNREAD_COUNT);

  const allRes = await page.request.get("/api/notifications?filter=all&limit=50");
  expect((await allRes.json()).data.items).toHaveLength(ADMIN_TOTAL);

  const bell = bellButton(page);
  await expect(bell).toBeVisible();
  await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${ADMIN_UNREAD_COUNT} غير مقروء)`);

  await bell.click();
  // Default tab is "غير مقروء" — the popover's latest-15 window includes the newest unread row.
  await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}0`)).toBeVisible();

  // Switch to "الكل" — the read tickets are visible there too.
  await page.getByRole("tab", { name: "الكل" }).click();
  await expect(page.getByText(`سؤال جديد على الطلب #TESTTIX${uniqueSuffix}0`)).toBeVisible();

  // Escape closes the popover (keyboard reachability).
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "الكل" })).toBeHidden();
});

test("admin bell: clicking an unread row marks it read and navigates to its href", async ({ page }) => {
  await loginAsAdmin(page);

  const targetHref = `/admin/orders/notif-test-${uniqueSuffix}-0`;
  const targetTitle = `طلب جديد #TESTORD${uniqueSuffix}0`;

  await bellButton(page).click();
  await page.getByText(targetTitle).click();

  await page.waitForURL(`**${targetHref}`, { timeout: 10_000 });

  const allRes = await page.request.get("/api/notifications?filter=all&limit=50");
  const allJson = await allRes.json();
  const row = allJson.data.items.find((r: { href: string }) => r.href === targetHref);
  expect(row).toBeTruthy();
  expect(row.readAt).not.toBeNull();

  const countRes = await page.request.get("/api/notifications/unread-count");
  expect((await countRes.json()).data.unreadCount).toBe(ADMIN_UNREAD_COUNT - 1);
});

test("admin bell: mark-all clears the badge", async ({ page }) => {
  await loginAsAdmin(page);

  await bellButton(page).click();
  await page.getByRole("button", { name: "تعليم الكل كمقروء" }).click();

  // 10.52 — the read route drops the cached count, so the badge clears at once (well inside
  // the 20 s poll), not on a later tick.
  await expect(bellButton(page)).toHaveAttribute("aria-label", "الإشعارات", { timeout: 4_000 });

  const countRes = await page.request.get("/api/notifications/unread-count");
  expect((await countRes.json()).data.unreadCount).toBe(0);
});

test("admin history page: filters, empty state, cursor pagination", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/notifications");
  await expect(page).toHaveTitle("الإشعارات · لوحة الإدارة");

  // Everything was marked read by the previous test — "غير مقروء" is empty.
  await page.getByRole("tab", { name: "غير مقروء" }).click();
  await expect(page.getByText("لا توجد إشعارات غير مقروءة")).toBeVisible();

  // "الكل" shows the full 25-row history, paginated at 20.
  await page.getByRole("tab", { name: "الكل" }).click();
  await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}0`)).toBeVisible();
  const loadMore = page.getByRole("button", { name: "عرض المزيد" });
  await expect(loadMore).toBeVisible();
  // Page 1 (20 of 25) ends mid-way through the order rows; the oldest one only appears once
  // "عرض المزيد" pulls the second page in.
  await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}21`)).toBeHidden();
  await loadMore.click();
  await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}21`)).toBeVisible();
  await expect(loadMore).toBeHidden();
});

test("partner bell: badge matches unread count, click marks read and navigates", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  // The fixture user's `User.role` is "CUSTOMER" (only the linked `Partner` row makes it a
  // partner) — the login form's post-login redirect only special-cases "PARTNER"/"ADMIN", so
  // it lands on "/" here; go to the portal explicitly rather than assume the redirect did.
  await page.goto("/partner");

  const countRes = await page.request.get("/api/notifications/unread-count");
  expect((await countRes.json()).data.unreadCount).toBe(PARTNER_UNREAD_COUNT);

  const bell = bellButton(page);
  await expect(bell).toHaveAttribute("aria-label", `الإشعارات (${PARTNER_UNREAD_COUNT} غير مقروء)`);
  await bell.click();

  const targetHref = `/partner/orders/notif-test-partner-${uniqueSuffix}-0`;
  await page.getByText(`طلب جديد #TESTPART${uniqueSuffix}0`).click();
  await page.waitForURL(`**${targetHref}`, { timeout: 10_000 });

  const allRes = await page.request.get("/api/notifications?filter=all&limit=50");
  const row = (await allRes.json()).data.items.find((r: { href: string }) => r.href === targetHref);
  expect(row?.readAt).not.toBeNull();
});

test("partner: cannot read an admin's notification", async ({ page }) => {
  await loginAs(page, pair, "AGENT");

  const adminRowRes = await page.request.get("/api/notifications?filter=all&limit=50");
  // The partner session only ever sees its own rows — none of the admin's seeded titles leak.
  const items = (await adminRowRes.json()).data.items as { title: string }[];
  expect(items.some((r) => r.title.includes("TESTORD"))).toBe(false);
});

test("partner history page renders the seeded rows", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/notifications");
  await expect(page).toHaveTitle("الإشعارات · لوحة الشريك");
  await expect(page.getByText(`طلب جديد #TESTPART${uniqueSuffix}1`)).toBeVisible();
});

test("10.37 — the badge caps at 99+ when an admin has 120 unread rows", async ({ page }) => {
  // A dedicated admin so the other tests' exact counts (22/25) are untouched. Rows are seeded
  // BEFORE this user's first login, so the first poll computes the count from Postgres and no
  // stale Redis entry (10.52) can exist for the new user id.
  const capPhone = `+2010${String(Date.now()).slice(-7)}4`;
  const capAdmin = await prisma.user.create({
    data: { phone: capPhone, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: `مسؤول سقف الإشعارات ${uniqueSuffix}` },
  });
  capAdminUserId = capAdmin.id;
  const now = Date.now();
  await prisma.notification.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      userId: capAdmin.id,
      kind: "order.created",
      title: `طلب جديد #TESTCAP${uniqueSuffix}${i}`,
      body: null,
      href: `/admin/orders/notif-cap-${uniqueSuffix}-${i}`,
      entityType: "order",
      entityId: `notif-cap-${uniqueSuffix}-${i}`,
      createdAt: new Date(now - i * 1000),
    })),
  });

  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(capPhone.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });

  const bell = bellButton(page);
  await expect(bell).toHaveAttribute("aria-label", "الإشعارات (أكثر من 99 غير مقروء)", { timeout: 15_000 });
  await expect(bell.getByText("99+", { exact: true })).toBeVisible();

  // The API still reports the true number; only the badge text is capped.
  const countRes = await page.request.get("/api/notifications/unread-count");
  expect((await countRes.json()).data.unreadCount).toBeGreaterThanOrEqual(120);
});

test("screenshots: popover and history page, both surfaces, both viewports", async ({ page }) => {
  // Four logins + two never-warmed routes (/admin|partner/notifications) per viewport, on a
  // dev server whose Turbopack compiles those on first hit — well past the file's 90s default.
  test.setTimeout(240_000);
  const dir = path.resolve(__dirname, "../../test-results/10.35");
  fs.mkdirSync(dir, { recursive: true });

  const viewports = [
    { name: "desktop", width: 1514, height: 681 },
    { name: "mobile", width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // Same reasoning as below — an existing (partner, on the second iteration) session would
    // make `/login` redirect away before the admin login form ever renders.
    await page.request.post("/api/auth/logout");
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await bellButton(page).click();
    // The earlier tests already marked every admin row read — "غير مقروء" (the default tab)
    // is empty by now, which is a true but uninteresting screenshot; "الكل" still has rows.
    await page.getByRole("tab", { name: "الكل" }).click();
    await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}0`)).toBeVisible();

    // Verifier fix (10.35 rework) — prove the popover is opaque and correctly sized at this
    // viewport, not just eyeball the screenshot.
    const popover = page.getByTestId("notifications-popover");
    const bg = await popover.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
    const box = await popover.boundingBox();
    console.log(`[10.35] popover at ${vp.width}×${vp.height}: background=${bg} width=${box?.width}`);
    if (vp.width < 640) {
      // w-[calc(100vw-24px)] — never wider than the viewport minus a 12px gutter each side.
      expect(box!.width).toBeLessThanOrEqual(vp.width - 24 + 1);
      expect(box!.width).toBeGreaterThan(vp.width - 24 - 5);
    } else {
      expect(box!.width).toBeCloseTo(400, 0);
    }

    // Radix fades the content in (`data-[state=open]:animate-in fade-in-0`) — the computed
    // `background-color` above is already the final opaque value regardless, but a screenshot
    // taken mid-fade still renders the page behind it blended through the partial opacity.
    // Wait for the animation to finish before capturing.
    await expect
      .poll(async () => popover.evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");

    await page.screenshot({ path: path.join(dir, `admin-bell-popover-${vp.name}.png`) });
    await page.keyboard.press("Escape");

    await page.goto("/admin/notifications");
    await expect(page.getByText(`طلب جديد #TESTORD${uniqueSuffix}0`)).toBeVisible();
    await page.screenshot({ path: path.join(dir, `admin-notifications-page-${vp.name}.png`), fullPage: true });

    // `/login` redirects an already-authenticated session straight back to its dashboard (see
    // `app/(auth)/login/page.tsx`) — without logging the admin session out first, `loginAs`
    // below would never see the login form and hang until this test's own timeout.
    await page.request.post("/api/auth/logout");
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner");
    await page.waitForLoadState("networkidle");
    await bellButton(page).click();
    await expect(page.getByText(`طلب جديد #TESTPART${uniqueSuffix}1`)).toBeVisible();
    const partnerPopover = page.getByTestId("notifications-popover");
    await expect
      .poll(async () => partnerPopover.evaluate((el) => getComputedStyle(el).opacity))
      .toBe("1");
    await page.screenshot({ path: path.join(dir, `partner-bell-popover-${vp.name}.png`) });
    await page.keyboard.press("Escape");

    await page.goto("/partner/notifications");
    await expect(page.getByText(`طلب جديد #TESTPART${uniqueSuffix}1`)).toBeVisible();
    await page.screenshot({ path: path.join(dir, `partner-notifications-page-${vp.name}.png`), fullPage: true });
  }
});
