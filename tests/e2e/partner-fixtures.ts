import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Shared partner e2e fixture helpers (backlog 4.16, standing rule 9: "e2e fixtures come
 * from `tests/e2e/partner-fixtures.ts`, under `test-env.ts`'s production guard, and clean
 * up after themselves"). Every spec importing this file must call `loadRedesignTestEnv()`
 * (from `./test-env`) *before* importing/constructing a `PrismaClient`, exactly like
 * `auth-login.spec.ts` — this module does not call it itself, so it stays safe to import
 * from a spec that has already guarded its own env loading.
 *
 * Public API (kept small/typed for 4.17–4.23's specs):
 *   const pair = await seedPartnerPair();      // AGENT + linked DISTRIBUTOR, unique phones
 *   await loginAs(page, pair, "AGENT");        // logs in as either role via the real /login form
 *   await cleanupPartnerPair(pair);            // deletes everything seedPartnerPair created
 */

const PASSWORD = "PartnerTest123!";

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(plain, salt);
  return `${salt}:${key.toString("hex")}`;
}

/** Logs in via the real `/login` form given a raw local phone (no fixture pair needed). */
export async function loginWithPhone(page: Page, localPhone: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(localPhone);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

export type PartnerFixtureSide = {
  userId: string;
  partnerId: string;
  phone: string; // E.164, e.g. "+201099912345"
  localPhone: string; // what the login form's phone input expects, e.g. "1099912345"
  name: string;
};

export type PartnerFixturePair = {
  agent: PartnerFixtureSide;
  distributor: PartnerFixtureSide;
  password: string;
};

/** Backlog 5.1 — optional per-side working-profile overrides for `seedPartnerPair()`. */
export type PartnerFixtureProfile = {
  dailyOrderCapacity?: number | null;
  confirmSlaHours?: number;
  shipSlaHours?: number;
  workingDays?: string[];
  costRateBps?: number;
  lowStockThreshold?: number;
};

export type PartnerFixtureOptions = {
  agent?: PartnerFixtureProfile;
  distributor?: PartnerFixtureProfile;
};

/** Unique-per-run Egyptian mobile number, distinct across a single test process. */
let seq = 0;
function uniqueLocalPhone(): string {
  seq += 1;
  const suffix = String(Date.now()).slice(-7) + String(seq).padStart(2, "0");
  return `10${suffix}`.slice(0, 10);
}

export async function seedPartnerPair(
  prisma: PrismaClient,
  options: PartnerFixtureOptions = {}
): Promise<PartnerFixturePair> {
  const passwordHash = await hashPassword(PASSWORD);

  const agentLocalPhone = uniqueLocalPhone();
  const agentPhone = `+20${agentLocalPhone}`;
  const agentUser = await prisma.user.create({
    data: { phone: agentPhone, role: "CUSTOMER", passwordHash },
  });
  const agentProfile = options.agent ?? {};
  const agentPartner = await prisma.partner.create({
    data: {
      userId: agentUser.id,
      partnerType: "AGENT",
      name: "وكيل الاختبار",
      governorate: "القاهرة",
      phone: agentPhone,
      isActive: true,
      ...(agentProfile.dailyOrderCapacity !== undefined && { dailyOrderCapacity: agentProfile.dailyOrderCapacity }),
      ...(agentProfile.confirmSlaHours !== undefined && { confirmSlaHours: agentProfile.confirmSlaHours }),
      ...(agentProfile.shipSlaHours !== undefined && { shipSlaHours: agentProfile.shipSlaHours }),
      ...(agentProfile.workingDays !== undefined && { workingDays: agentProfile.workingDays }),
      ...(agentProfile.costRateBps !== undefined && { costRateBps: agentProfile.costRateBps }),
      ...(agentProfile.lowStockThreshold !== undefined && { lowStockThreshold: agentProfile.lowStockThreshold }),
    },
  });

  const distributorLocalPhone = uniqueLocalPhone();
  const distributorPhone = `+20${distributorLocalPhone}`;
  const distributorUser = await prisma.user.create({
    data: { phone: distributorPhone, role: "CUSTOMER", passwordHash },
  });
  const distributorProfile = options.distributor ?? {};
  const distributorPartner = await prisma.partner.create({
    data: {
      userId: distributorUser.id,
      partnerType: "DISTRIBUTOR",
      name: "موزع الاختبار",
      governorate: "الجيزة",
      phone: distributorPhone,
      linkedAgentId: agentPartner.id,
      isActive: true,
      ...(distributorProfile.dailyOrderCapacity !== undefined && {
        dailyOrderCapacity: distributorProfile.dailyOrderCapacity,
      }),
      ...(distributorProfile.confirmSlaHours !== undefined && { confirmSlaHours: distributorProfile.confirmSlaHours }),
      ...(distributorProfile.shipSlaHours !== undefined && { shipSlaHours: distributorProfile.shipSlaHours }),
      ...(distributorProfile.workingDays !== undefined && { workingDays: distributorProfile.workingDays }),
      ...(distributorProfile.costRateBps !== undefined && { costRateBps: distributorProfile.costRateBps }),
      ...(distributorProfile.lowStockThreshold !== undefined && {
        lowStockThreshold: distributorProfile.lowStockThreshold,
      }),
    },
  });

  return {
    agent: {
      userId: agentUser.id,
      partnerId: agentPartner.id,
      phone: agentPhone,
      localPhone: agentLocalPhone,
      name: agentPartner.name,
    },
    distributor: {
      userId: distributorUser.id,
      partnerId: distributorPartner.id,
      phone: distributorPhone,
      localPhone: distributorLocalPhone,
      name: distributorPartner.name,
    },
    password: PASSWORD,
  };
}

/**
 * Backlog 5.5 — a second (or third...) DISTRIBUTOR linked to an already-seeded agent, for
 * the network roster's "seeded mix" (`seedPartnerPair()` only creates one agent + one
 * distributor). Caller is responsible for passing every returned id into
 * `cleanupPartnerPair`'s `extraPartnerIds`.
 */
export async function seedLinkedDistributor(
  prisma: PrismaClient,
  agentPartnerId: string,
  overrides: Partial<{ name: string; governorate: string; isActive: boolean }> = {}
): Promise<PartnerFixtureSide> {
  const passwordHash = await hashPassword(PASSWORD);
  const localPhone = uniqueLocalPhone();
  const phone = `+20${localPhone}`;
  const user = await prisma.user.create({ data: { phone, role: "CUSTOMER", passwordHash } });
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      partnerType: "DISTRIBUTOR",
      name: overrides.name ?? "موزع إضافي للاختبار",
      governorate: overrides.governorate ?? "الجيزة",
      phone,
      linkedAgentId: agentPartnerId,
      isActive: overrides.isActive ?? true,
    },
  });
  return {
    userId: user.id,
    partnerId: partner.id,
    phone,
    localPhone,
    name: partner.name,
  };
}

/** Logs in via the real `/login` form (phone + password) as the given fixture side. */
export async function loginAs(
  page: Page,
  pair: PartnerFixturePair,
  role: "AGENT" | "DISTRIBUTOR"
): Promise<void> {
  const side = role === "AGENT" ? pair.agent : pair.distributor;
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(side.localPhone);
  await page.getByLabel("كلمة المرور").fill(pair.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
}

/**
 * Removes everything `seedPartnerPair` created, plus any inventory/orders/requests/receipts
 * tied to it. `extraPartnerIds` (backlog 5.5) additionally removes distributors created via
 * `seedLinkedDistributor` — their users are not deleted here (caller seeded them, caller's
 * `userId`s are already known to it); pass them via `extraUserIds` too.
 */
export async function cleanupPartnerPair(
  prisma: PrismaClient,
  pair: PartnerFixturePair,
  extra: { partnerIds?: string[]; userIds?: string[] } = {}
): Promise<void> {
  const partnerIds = [pair.agent.partnerId, pair.distributor.partnerId, ...(extra.partnerIds ?? [])];

  // Backlog 5.1 — new tables, deleted before their `StockReceipt`/`Partner` parents.
  await prisma.partnerPayment.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.partnerStockThreshold.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.stockReceiptLine.deleteMany({ where: { receipt: { partnerId: { in: partnerIds } } } });
  await prisma.stockReceipt.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.restockRequestItem.deleteMany({
    where: { restockRequest: { OR: [{ sourcePartnerId: { in: partnerIds } }, { destinationPartnerId: { in: partnerIds } }] } },
  });
  await prisma.restockRequest.deleteMany({
    where: { OR: [{ sourcePartnerId: { in: partnerIds } }, { destinationPartnerId: { in: partnerIds } }] },
  });
  await prisma.inventoryLedger.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.partnerInventory.deleteMany({ where: { partnerId: { in: partnerIds } } });
  await prisma.order.updateMany({
    where: { assignedPartnerId: { in: partnerIds } },
    data: { assignedPartnerId: null },
  });
  await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: [pair.agent.userId, pair.distributor.userId, ...(extra.userIds ?? [])] } },
  });
}
