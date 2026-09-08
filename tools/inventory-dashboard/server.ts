/**
 * Standalone, local-only partner inventory audit dashboard.
 *
 * Read-only: never writes to the DB, runs as its own process on its own port,
 * completely separate from the deployed Next.js app (`npm run dev` / `next start`).
 * Reads directly from InventoryLedger (the ledger every stock mutation already
 * writes to: partner/admin manual edits as MANUAL_ADJUSTMENT, order-driven
 * changes as ORDER_RESERVE / ORDER_COMMIT / ORDER_RELEASE / ORDER_RESTORE, etc).
 *
 *   npm run inventory:dashboard
 *   → http://127.0.0.1:4741
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const PORT = Number(process.env.INVENTORY_DASHBOARD_PORT ?? 4741);
const HOST = "127.0.0.1"; // local only, never expose beyond this machine

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_HTML_PATH = path.join(PUBLIC_DIR, "index.html");
const ITEM_HTML_PATH = path.join(PUBLIC_DIR, "item.html");

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseIntParam(value: string | null, fallback: number, max?: number) {
  const n = value !== null ? Number.parseInt(value, 10) : NaN;
  const result = Number.isFinite(n) && n >= 0 ? n : fallback;
  return max !== undefined ? Math.min(result, max) : result;
}

async function getPartners() {
  return prisma.partner.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, partnerType: true, governorate: true, isActive: true },
  });
}

async function getPartnerItems(params: { partnerId: string; q: string; limit: number; offset: number }) {
  const { partnerId, q, limit, offset } = params;
  const where: Prisma.ProductWhereInput = {
    active: true,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
            { variants: { some: { name: { contains: q, mode: "insensitive" } } } },
            { variants: { some: { colorName: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
    variants: { some: {} },
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take: limit,
      skip: offset,
      include: {
        variants: {
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            sku: true,
            name: true,
            colorName: true,
            colorHex: true,
            partnerInventories: {
              where: { partnerId },
              select: { id: true, stockAvailable: true, stockReserved: true, updatedAt: true },
            },
          },
        },
      },
    }),
    prisma.product.count({ where }),
  ]);

  const rows = products.flatMap((product) =>
    product.variants.map((variant) => {
      const inv = variant.partnerInventories[0] ?? null;
      const stockAvailable = inv?.stockAvailable ?? 0;
      const stockReserved = inv?.stockReserved ?? 0;
      return {
        productId: product.id,
        productName: product.name,
        variantId: variant.id,
        sku: variant.sku,
        variantName: variant.name,
        colorName: variant.colorName,
        colorHex: variant.colorHex,
        hasInventoryRow: inv !== null,
        stockAvailable,
        stockReserved,
        sellable: Math.max(0, stockAvailable - stockReserved),
        updatedAt: inv?.updatedAt ?? null,
      };
    })
  );

  return { rows, total };
}

/**
 * Cross-partner product analytics: for every active product with at least one variant,
 * total sellable stock (available - reserved) summed across every partner and variant,
 * the cheapest variant's price, units sold in the last 30 days (a demand/velocity proxy),
 * and the product's current storefront sortOrder ("priority") for comparison against a
 * suggested one. Scoring/ranking itself happens client-side (see index.html) so the weights
 * can be tuned live without a round trip.
 */
async function getProductAnalytics() {
  const products = await prisma.product.findMany({
    where: { active: true, variants: { some: {} } },
    select: {
      id: true,
      name: true,
      slug: true,
      sortOrder: true,
      category: { select: { name: true } },
      variants: { select: { id: true, pricePiastres: true } },
    },
  });

  const variantToProduct = new Map<string, string>();
  const lowestPriceByProduct = new Map<string, number>();
  const variantCountByProduct = new Map<string, number>();
  for (const product of products) {
    variantCountByProduct.set(product.id, product.variants.length);
    let lowest = Infinity;
    for (const variant of product.variants) {
      variantToProduct.set(variant.id, product.id);
      if (variant.pricePiastres < lowest) lowest = variant.pricePiastres;
    }
    lowestPriceByProduct.set(product.id, lowest);
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [invRows, recentItems] = await Promise.all([
    prisma.partnerInventory.findMany({
      select: { variantId: true, stockAvailable: true, stockReserved: true },
    }),
    prisma.orderItem.findMany({
      where: { order: { createdAt: { gte: cutoff }, status: { not: "CANCELLED" } } },
      select: { variantId: true, quantity: true },
    }),
  ]);

  const sellableStockByProduct = new Map<string, number>();
  for (const row of invRows) {
    const productId = variantToProduct.get(row.variantId);
    if (!productId) continue;
    const sellable = Math.max(0, row.stockAvailable - row.stockReserved);
    sellableStockByProduct.set(productId, (sellableStockByProduct.get(productId) ?? 0) + sellable);
  }

  const unitsSoldByProduct = new Map<string, number>();
  for (const item of recentItems) {
    const productId = variantToProduct.get(item.variantId);
    if (!productId) continue;
    unitsSoldByProduct.set(productId, (unitsSoldByProduct.get(productId) ?? 0) + item.quantity);
  }

  return products.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    categoryName: product.category.name,
    currentSortOrder: product.sortOrder,
    variantCount: variantCountByProduct.get(product.id) ?? 0,
    lowestPricePiastres: lowestPriceByProduct.get(product.id) ?? 0,
    totalSellableStock: sellableStockByProduct.get(product.id) ?? 0,
    unitsSoldLast30d: unitsSoldByProduct.get(product.id) ?? 0,
  }));
}

async function getItem(params: { partnerId: string; variantId: string }) {
  const [partner, variant] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: params.partnerId },
      select: { id: true, name: true, partnerType: true, governorate: true, isActive: true },
    }),
    prisma.variant.findUnique({
      where: { id: params.variantId },
      select: {
        id: true,
        sku: true,
        name: true,
        colorName: true,
        colorHex: true,
        product: { select: { id: true, name: true } },
        partnerInventories: {
          where: { partnerId: params.partnerId },
          select: { id: true, stockAvailable: true, stockReserved: true, updatedAt: true },
        },
      },
    }),
  ]);
  if (!partner || !variant) return null;

  const inv = variant.partnerInventories[0] ?? null;
  const stockAvailable = inv?.stockAvailable ?? 0;
  const stockReserved = inv?.stockReserved ?? 0;

  return {
    partner,
    item: {
      productId: variant.product.id,
      productName: variant.product.name,
      variantId: variant.id,
      sku: variant.sku,
      variantName: variant.name,
      colorName: variant.colorName,
      colorHex: variant.colorHex,
      hasInventoryRow: inv !== null,
      stockAvailable,
      stockReserved,
      sellable: Math.max(0, stockAvailable - stockReserved),
      updatedAt: inv?.updatedAt ?? null,
    },
  };
}

const LEDGER_REASONS = [
  "MANUAL_ADJUSTMENT",
  "ORDER_RESERVE",
  "ORDER_COMMIT",
  "ORDER_RELEASE",
  "ORDER_RESTORE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "RESTOCK_REQUEST_CREATE",
  "RESTOCK_REQUEST_FULFILL",
  "LEGACY_BACKFILL",
] as const;

/**
 * Actor derivation: InventoryLedger has no dedicated "who did this" column. Instead, every
 * write path that knows its own source (admin dashboard, partner dashboard, checkout, an
 * admin reassignment, ...) stamps a fixed string into the existing `notes` column — see the
 * matching constants passed at each call site in lib/inventory/partner-inventory.ts and its
 * callers. Anything not in one of these two sets (including all pre-existing rows written
 * before this convention existed, and the automated checkout flow, which has no admin/partner
 * operator) is bucketed as "System" by design, not "Unknown" — we only name a specific actor
 * type when we have positive evidence of one.
 */
const ADMIN_SOURCE_NOTES = [
  "Admin dashboard stock edit",
  "Admin order creation",
  "Admin order edit",
  "Admin order cancellation",
  "Admin reassignment",
];
const PARTNER_SOURCE_NOTES = ["Partner dashboard stock edit", "Partner order edit", "Partner order cancellation"];

function actorFor(notes: string | null): "Admin" | "Partner" | "System" {
  if (notes && ADMIN_SOURCE_NOTES.includes(notes)) return "Admin";
  if (notes && PARTNER_SOURCE_NOTES.includes(notes)) return "Partner";
  return "System";
}

async function getLedger(params: {
  partnerId?: string;
  variantId?: string;
  reason?: string;
  actor?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
}) {
  const where: Prisma.InventoryLedgerWhereInput = {};
  if (params.partnerId) where.partnerId = params.partnerId;
  if (params.variantId) where.variantId = params.variantId;
  if (params.reason && (LEDGER_REASONS as readonly string[]).includes(params.reason)) {
    where.reason = params.reason as (typeof LEDGER_REASONS)[number];
  }
  if (params.actor === "Admin") {
    where.notes = { in: ADMIN_SOURCE_NOTES };
  } else if (params.actor === "Partner") {
    where.notes = { in: PARTNER_SOURCE_NOTES };
  } else if (params.actor === "System") {
    where.OR = [{ notes: null }, { notes: { notIn: [...ADMIN_SOURCE_NOTES, ...PARTNER_SOURCE_NOTES] } }];
  }
  if (params.from || params.to) {
    where.createdAt = {
      ...(params.from ? { gte: new Date(params.from) } : {}),
      ...(params.to ? { lte: new Date(params.to) } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.inventoryLedger.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: params.limit,
      skip: params.offset,
      include: {
        partner: { select: { id: true, name: true } },
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            colorName: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    prisma.inventoryLedger.count({ where }),
  ]);

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      reason: row.reason,
      quantityAvailableDelta: row.quantityAvailableDelta,
      quantityReservedDelta: row.quantityReservedDelta,
      orderId: row.orderId,
      routedOrderId: row.routedOrderId,
      restockRequestId: row.restockRequestId,
      notes: row.notes,
      actor: actorFor(row.notes),
      partner: row.partner,
      variant: {
        id: row.variant.id,
        sku: row.variant.sku,
        name: row.variant.name,
        colorName: row.variant.colorName,
        productName: row.variant.product.name,
      },
    })),
  };
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "This tool is read-only; only GET is supported." });
      return;
    }

    if (url.pathname === "/") {
      const html = readFileSync(INDEX_HTML_PATH, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (url.pathname === "/item.html") {
      const html = readFileSync(ITEM_HTML_PATH, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (url.pathname === "/api/item") {
      const partnerId = url.searchParams.get("partnerId")?.trim();
      const variantId = url.searchParams.get("variantId")?.trim();
      if (!partnerId || !variantId) {
        sendJson(res, 400, { error: "partnerId and variantId are required" });
        return;
      }
      const result = await getItem({ partnerId, variantId });
      if (!result) {
        sendJson(res, 404, { error: "Partner or variant not found" });
        return;
      }
      sendJson(res, 200, result);
      return;
    }

    if (url.pathname === "/api/analytics/products") {
      sendJson(res, 200, { products: await getProductAnalytics() });
      return;
    }

    if (url.pathname === "/api/reasons") {
      sendJson(res, 200, { reasons: LEDGER_REASONS });
      return;
    }

    if (url.pathname === "/api/partners") {
      sendJson(res, 200, { partners: await getPartners() });
      return;
    }

    if (url.pathname === "/api/partner-items") {
      const partnerId = url.searchParams.get("partnerId")?.trim();
      if (!partnerId) {
        sendJson(res, 400, { error: "partnerId is required" });
        return;
      }
      const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
      const limit = parseIntParam(url.searchParams.get("limit"), 20, 100) || 20;
      const offset = parseIntParam(url.searchParams.get("offset"), 0);
      sendJson(res, 200, await getPartnerItems({ partnerId, q, limit, offset }));
      return;
    }

    if (url.pathname === "/api/ledger") {
      const limit = parseIntParam(url.searchParams.get("limit"), 25, 200) || 25;
      const offset = parseIntParam(url.searchParams.get("offset"), 0);
      sendJson(
        res,
        200,
        await getLedger({
          partnerId: url.searchParams.get("partnerId")?.trim() || undefined,
          variantId: url.searchParams.get("variantId")?.trim() || undefined,
          reason: url.searchParams.get("reason")?.trim() || undefined,
          actor: url.searchParams.get("actor")?.trim() || undefined,
          from: url.searchParams.get("from")?.trim() || undefined,
          to: url.searchParams.get("to")?.trim() || undefined,
          limit,
          offset,
        })
      );
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Partner inventory audit dashboard (read-only, local): http://${HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});
