/**
 * Stock service: reserve, release, commit using Prisma transactions.
 * Checkout flow: available = stockAvailable - stockReserved; reserve = increase stockReserved only; commit = decrease both.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type StockLine = {
  variantId: string;
  quantity: number;
};

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
    await tx.variant.update({
      where: { id: variantId },
      data: {
        stockAvailable: { decrement: quantity },
        stockReserved: { decrement: quantity },
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
 * Reserve stock (legacy): decrease stockAvailable, increase stockReserved.
 * Fails if any variant has insufficient stockAvailable.
 */
export async function reserveStock(
  lines: StockLine[]
): Promise<{ success: true }> {
  await prisma.$transaction(async (tx) => {
    for (const { variantId, quantity } of lines) {
      if (quantity <= 0) continue;

      const v = await tx.variant.findUnique({
        where: { id: variantId },
        select: { id: true, stockAvailable: true, stockReserved: true },
      });
      if (!v) throw new Error(`Variant not found: ${variantId}`);
      const available = v.stockAvailable;
      if (available < quantity) {
        throw new InsufficientStockError(variantId, quantity, available);
      }

      await tx.variant.update({
        where: { id: variantId },
        data: {
          stockAvailable: { decrement: quantity },
          stockReserved: { increment: quantity },
        },
      });
    }
  });
  return { success: true };
}

/**
 * Release reserved stock: increase stockAvailable, decrease stockReserved.
 */
export async function releaseStock(lines: StockLine[]): Promise<{ success: true }> {
  await prisma.$transaction(async (tx) => {
    for (const { variantId, quantity } of lines) {
      if (quantity <= 0) continue;

      const v = await tx.variant.findUnique({
        where: { id: variantId },
        select: { id: true, stockReserved: true },
      });
      if (!v) throw new Error(`Variant not found: ${variantId}`);
      const toRelease = Math.min(quantity, v.stockReserved);

      await tx.variant.update({
        where: { id: variantId },
        data: {
          stockAvailable: { increment: toRelease },
          stockReserved: { decrement: toRelease },
        },
      });
    }
  });
  return { success: true };
}

/**
 * Commit reserved stock (e.g. on order confirmation): only decrease stockReserved.
 * stockAvailable was already reduced at reserve time.
 */
export async function commitStock(lines: StockLine[]): Promise<{ success: true }> {
  await prisma.$transaction(async (tx) => {
    for (const { variantId, quantity } of lines) {
      if (quantity <= 0) continue;

      const v = await tx.variant.findUnique({
        where: { id: variantId },
        select: { id: true, stockReserved: true },
      });
      if (!v) throw new Error(`Variant not found: ${variantId}`);
      const toCommit = Math.min(quantity, v.stockReserved);

      await tx.variant.update({
        where: { id: variantId },
        data: { stockReserved: { decrement: toCommit } },
      });
    }
  });
  return { success: true };
}
