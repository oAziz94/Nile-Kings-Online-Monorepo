/**
 * Stock service: reserve, release, commit using Prisma transactions.
 * Sellable = stockAvailable - stockReserved.
 * CREATED (unpaid InstaPay): stockReserved only. CONFIRMED+: committed (both counters adjusted).
 */

import type { OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type StockLine = {
  variantId: string;
  quantity: number;
};

/** Unpaid InstaPay orders hold units only in stockReserved until admin confirms or cancels. */
export function orderUsesReservationOnly(status: OrderStatus): boolean {
  return status === "CREATED";
}

export class InsufficientStockError extends Error {
  constructor(
    public variantId: string,
    public requested: number,
    public available: number
  ) {
    super(
      `Insufficient stock for variant ${variantId}: requested ${requested}, available ${available}`
    );
    this.name = "InsufficientStockError";
  }
}

/**
 * Reserve stock for order (CREATED state): lock variant rows, ensure available = stockAvailable - stockReserved >= qty, then increase stockReserved only.
 * Use within a Prisma transaction that also creates the Order.
 */
export async function reserveStockForOrder(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  lines: StockLine[]
): Promise<void> {
  const variantIds = lines.map((l) => l.variantId).filter((id, i, a) => a.indexOf(id) === i);
  if (variantIds.length === 0) return;

  // Lock rows: SELECT ... FOR UPDATE
  await tx.$executeRaw(
    Prisma.sql`SELECT id, "stockAvailable", "stockReserved" FROM "Variant" WHERE id IN (${Prisma.join(variantIds)}) FOR UPDATE`
  );

  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, stockAvailable: true, stockReserved: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  for (const { variantId, quantity } of lines) {
    if (quantity <= 0) continue;
    const v = byId.get(variantId);
    if (!v) throw new Error(`Variant not found: ${variantId}`);
    const available = v.stockAvailable - v.stockReserved;
    if (available < quantity) {
      throw new InsufficientStockError(variantId, quantity, available);
    }
    await tx.variant.update({
      where: { id: variantId },
      data: { stockReserved: { increment: quantity } },
    });
    // Update in-memory for multiple lines of same variant
    v.stockReserved += quantity;
  }
}

/**
 * Commit reservation (COD or Paymob success): stockAvailable -= qty, stockReserved -= qty; order becomes CONFIRMED.
 */
export async function commitReservation(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  lines: StockLine[]
): Promise<void> {
  for (const { variantId, quantity } of lines) {
    if (quantity <= 0) continue;
    const v = await tx.variant.findUnique({
      where: { id: variantId },
      select: { stockAvailable: true, stockReserved: true },
    });
    if (!v) throw new Error(`Variant not found: ${variantId}`);
    const toCommit = Math.min(quantity, v.stockReserved);
    if (toCommit < quantity) {
      throw new InsufficientStockError(
        variantId,
        quantity,
        Math.max(0, v.stockAvailable - v.stockReserved) + toCommit
      );
    }
    await tx.variant.update({
      where: { id: variantId },
      data: {
        stockAvailable: { decrement: toCommit },
        stockReserved: { decrement: toCommit },
      },
    });
  }
}

/**
 * Release reservation (expired or cancelled): stockReserved -= qty only (available effectively increases).
 */
export async function releaseReservation(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  lines: StockLine[]
): Promise<void> {
  for (const { variantId, quantity } of lines) {
    if (quantity <= 0) continue;
    const v = await tx.variant.findUnique({
      where: { id: variantId },
      select: { stockReserved: true },
    });
    if (!v) continue;
    const toRelease = Math.min(quantity, v.stockReserved);
    if (toRelease > 0) {
      await tx.variant.update({
        where: { id: variantId },
        data: { stockReserved: { decrement: toRelease } },
      });
    }
  }
}

/**
 * After commitReservation, stock left the sellable pool (stockAvailable was decremented).
 * When a confirmed-or-later order is cancelled, put those units back on stockAvailable only.
 */
export async function restoreCommittedStock(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  lines: StockLine[]
): Promise<void> {
  for (const { variantId, quantity } of lines) {
    if (quantity <= 0) continue;
    await tx.variant.updateMany({
      where: { id: variantId },
      data: { stockAvailable: { increment: quantity } },
    });
  }
}

function aggregateStockLines(lines: StockLine[]): StockLine[] {
  const m = new Map<string, number>();
  for (const { variantId, quantity } of lines) {
    if (quantity <= 0) continue;
    m.set(variantId, (m.get(variantId) ?? 0) + quantity);
  }
  return Array.from(m.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
}

/** True if both sets represent the same total quantity per variant. */
export function stockLinesEquivalent(linesA: StockLine[], linesB: StockLine[]): boolean {
  const a = aggregateStockLines(linesA);
  const b = aggregateStockLines(linesB);
  if (a.length !== b.length) return false;
  const mapB = new Map(b.map((l) => [l.variantId, l.quantity]));
  for (const l of a) {
    if (mapB.get(l.variantId) !== l.quantity) return false;
  }
  return true;
}

/**
 * Decrease stockAvailable only (sellable = stockAvailable - stockReserved), with row locks.
 * Used when editing a confirmed-or-later order: new lines replace committed inventory.
 */
export async function decrementSellableStock(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  lines: StockLine[]
): Promise<void> {
  const variantIds = lines.map((l) => l.variantId).filter((id, i, arr) => arr.indexOf(id) === i);
  if (variantIds.length === 0) return;

  await tx.$executeRaw(
    Prisma.sql`SELECT id, "stockAvailable", "stockReserved" FROM "Variant" WHERE id IN (${Prisma.join(variantIds)}) FOR UPDATE`
  );

  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, stockAvailable: true, stockReserved: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  for (const { variantId, quantity } of lines) {
    if (quantity <= 0) continue;
    const v = byId.get(variantId);
    if (!v) throw new Error(`Variant not found: ${variantId}`);
    const sellable = v.stockAvailable - v.stockReserved;
    if (sellable < quantity) {
      throw new InsufficientStockError(variantId, quantity, sellable);
    }
    await tx.variant.update({
      where: { id: variantId },
      data: { stockAvailable: { decrement: quantity } },
    });
    v.stockAvailable -= quantity;
  }
}

const ADMIN_ITEM_EDIT_POST_COMMIT: OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
];

/**
 * Apply inventory delta when admin replaces order lines. Caller ensures status is not CANCELLED.
 * CREATED: release old reservation, reserve new lines. Post-commit: restore old sale, take new from sellable pool.
 */
export async function reconcileStockForAdminOrderItemEdit(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  orderStatus: OrderStatus,
  oldLines: StockLine[],
  newLines: StockLine[]
): Promise<void> {
  const oldA = aggregateStockLines(oldLines);
  const newA = aggregateStockLines(newLines);
  if (stockLinesEquivalent(oldA, newA)) return;

  if (orderStatus === "CREATED") {
    await releaseReservation(tx, oldA);
    await reserveStockForOrder(tx, newA);
    return;
  }
  if (ADMIN_ITEM_EDIT_POST_COMMIT.includes(orderStatus)) {
    await restoreCommittedStock(tx, oldA);
    await decrementSellableStock(tx, newA);
    return;
  }
  throw new Error(`Stock reconcile not supported for order status: ${orderStatus}`);
}
