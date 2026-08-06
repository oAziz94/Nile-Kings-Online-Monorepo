import { Prisma, type InventoryLedgerReason, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { StockLine } from "@/lib/services/stock";

export type PrismaTx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export class InsufficientPartnerStockError extends Error {
  constructor(
    public partnerId: string,
    public variantId: string,
    public requested: number,
    public available: number
  ) {
    super(
      `Insufficient partner stock for partner ${partnerId}, variant ${variantId}: requested ${requested}, available ${available}`
    );
    this.name = "InsufficientPartnerStockError";
  }
}

export function aggregateStockLines(lines: StockLine[]): StockLine[] {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }
  return Array.from(quantities.entries()).map(([variantId, quantity]) => ({
    variantId,
    quantity,
  }));
}

export function orderUsesPartnerReservationOnly(status: OrderStatus): boolean {
  return status === "CREATED";
}

async function lockPartnerInventories(
  tx: PrismaTx,
  partnerIds: string[],
  variantIds: string[]
): Promise<void> {
  if (partnerIds.length === 0 || variantIds.length === 0) return;
  await tx.$executeRaw(
    Prisma.sql`
      SELECT id, "partnerId", "variantId", "stockAvailable", "stockReserved"
      FROM "PartnerInventory"
      WHERE "partnerId" IN (${Prisma.join(partnerIds)})
        AND "variantId" IN (${Prisma.join(variantIds)})
      FOR UPDATE
    `
  );
}

async function writeLedger(
  tx: PrismaTx,
  input: {
    partnerId: string;
    variantId: string;
    reason: InventoryLedgerReason;
    availableDelta?: number;
    reservedDelta?: number;
    orderId?: string | null;
    routedOrderId?: string | null;
    restockRequestId?: string | null;
    notes?: string | null;
  }
): Promise<void> {
  await tx.inventoryLedger.create({
    data: {
      partnerId: input.partnerId,
      variantId: input.variantId,
      reason: input.reason,
      quantityAvailableDelta: input.availableDelta ?? 0,
      quantityReservedDelta: input.reservedDelta ?? 0,
      orderId: input.orderId ?? null,
      routedOrderId: input.routedOrderId ?? null,
      restockRequestId: input.restockRequestId ?? null,
      notes: input.notes ?? null,
    },
  });
}

export async function getEligiblePartnersForGovernorate(governorate: string) {
  const trimmed = governorate.trim();
  if (!trimmed) return [];
  const rule = await prisma.reroutingRule.findFirst({
    where: { governorate: trimmed, isActive: true },
    include: {
      partners: {
        where: { isActive: true, partner: { isActive: true } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: true },
      },
    },
  });
  if (!rule) return [];
  return rule.partners.map((link) => ({
    rule,
    link,
    partner: link.partner,
  }));
}

export async function getSellableQuantityForPartnerVariant(
  partnerId: string,
  variantId: string
): Promise<number> {
  const row = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId, variantId } },
    select: { stockAvailable: true, stockReserved: true },
  });
  return row ? Math.max(0, row.stockAvailable - row.stockReserved) : 0;
}

export async function canPartnerFulfillLines(
  partnerId: string,
  lines: StockLine[]
): Promise<boolean> {
  const aggregated = aggregateStockLines(lines);
  if (aggregated.length === 0) return false;
  const rows = await prisma.partnerInventory.findMany({
    where: {
      partnerId,
      variantId: { in: aggregated.map((line) => line.variantId) },
    },
    select: { variantId: true, stockAvailable: true, stockReserved: true },
  });
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  return aggregated.every((line) => {
    const row = byVariant.get(line.variantId);
    const sellable = row ? row.stockAvailable - row.stockReserved : 0;
    return sellable >= line.quantity;
  });
}

export async function findFulfillablePartnerForGovernorate(input: {
  governorate: string;
  lines: StockLine[];
  preferredPartnerId?: string | null;
}): Promise<{ partnerId: string; ruleId: string; sequence: number; originGovernorate: string } | null> {
  const eligible = await getEligiblePartnersForGovernorate(input.governorate);
  if (eligible.length === 0) return null;

  const ordered = [...eligible];
  if (input.preferredPartnerId) {
    ordered.sort((a, b) => {
      if (a.partner.id === input.preferredPartnerId) return -1;
      if (b.partner.id === input.preferredPartnerId) return 1;
      return 0;
    });
  } else {
    const lastId = eligible[0]?.rule.lastAssignedPartnerId;
    const lastIndex = lastId ? ordered.findIndex((entry) => entry.partner.id === lastId) : -1;
    if (lastIndex >= 0) {
      ordered.push(...ordered.splice(0, lastIndex + 1));
    }
  }

  for (const entry of ordered) {
    if (await canPartnerFulfillLines(entry.partner.id, input.lines)) {
      const sequence = eligible.findIndex((item) => item.partner.id === entry.partner.id) + 1;
      return {
        partnerId: entry.partner.id,
        ruleId: entry.rule.id,
        sequence: Math.max(1, sequence),
        originGovernorate: entry.partner.governorate,
      };
    }
  }

  return null;
}

export async function reservePartnerStockForOrder(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null
): Promise<void> {
  const aggregated = aggregateStockLines(lines);
  const variantIds = aggregated.map((line) => line.variantId);
  await lockPartnerInventories(tx, [partnerId], variantIds);

  const rows = await tx.partnerInventory.findMany({
    where: { partnerId, variantId: { in: variantIds } },
    select: { id: true, variantId: true, stockAvailable: true, stockReserved: true },
  });
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));

  for (const line of aggregated) {
    const row = byVariant.get(line.variantId);
    const available = row ? row.stockAvailable - row.stockReserved : 0;
    if (!row || available < line.quantity) {
      throw new InsufficientPartnerStockError(partnerId, line.variantId, line.quantity, Math.max(0, available));
    }
    await tx.partnerInventory.update({
      where: { id: row.id },
      data: { stockReserved: { increment: line.quantity } },
    });
    row.stockReserved += line.quantity;
    await writeLedger(tx, {
      partnerId,
      variantId: line.variantId,
      reason: "ORDER_RESERVE",
      reservedDelta: line.quantity,
      orderId,
    });
  }
}

export async function commitPartnerReservation(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null
): Promise<void> {
  for (const line of aggregateStockLines(lines)) {
    const row = await tx.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId, variantId: line.variantId } },
      select: { id: true, stockAvailable: true, stockReserved: true },
    });
    const reserved = row?.stockReserved ?? 0;
    if (!row || reserved < line.quantity) {
      throw new InsufficientPartnerStockError(partnerId, line.variantId, line.quantity, reserved);
    }
    await tx.partnerInventory.update({
      where: { id: row.id },
      data: {
        stockAvailable: { decrement: line.quantity },
        stockReserved: { decrement: line.quantity },
      },
    });
    await writeLedger(tx, {
      partnerId,
      variantId: line.variantId,
      reason: "ORDER_COMMIT",
      availableDelta: -line.quantity,
      reservedDelta: -line.quantity,
      orderId,
    });
  }
}

export async function releasePartnerReservation(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null
): Promise<void> {
  for (const line of aggregateStockLines(lines)) {
    const row = await tx.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId, variantId: line.variantId } },
      select: { id: true, stockReserved: true },
    });
    if (!row) continue;
    const toRelease = Math.min(row.stockReserved, line.quantity);
    if (toRelease <= 0) continue;
    await tx.partnerInventory.update({
      where: { id: row.id },
      data: { stockReserved: { decrement: toRelease } },
    });
    await writeLedger(tx, {
      partnerId,
      variantId: line.variantId,
      reason: "ORDER_RELEASE",
      reservedDelta: -toRelease,
      orderId,
    });
  }
}

export async function restorePartnerCommittedStock(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null
): Promise<void> {
  for (const line of aggregateStockLines(lines)) {
    await tx.partnerInventory.upsert({
      where: { partnerId_variantId: { partnerId, variantId: line.variantId } },
      update: { stockAvailable: { increment: line.quantity } },
      create: {
        partnerId,
        variantId: line.variantId,
        stockAvailable: line.quantity,
        stockReserved: 0,
      },
    });
    await writeLedger(tx, {
      partnerId,
      variantId: line.variantId,
      reason: "ORDER_RESTORE",
      availableDelta: line.quantity,
      orderId,
    });
  }
}

export async function reconcilePartnerStockForAdminOrderItemEdit(
  tx: PrismaTx,
  partnerId: string,
  orderStatus: OrderStatus,
  oldLines: StockLine[],
  newLines: StockLine[],
  orderId?: string | null
): Promise<void> {
  if (orderUsesPartnerReservationOnly(orderStatus)) {
    await releasePartnerReservation(tx, partnerId, oldLines, orderId);
    await reservePartnerStockForOrder(tx, partnerId, newLines, orderId);
    return;
  }

  if (["CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED"].includes(orderStatus)) {
    await restorePartnerCommittedStock(tx, partnerId, oldLines, orderId);
    await reservePartnerStockForOrder(tx, partnerId, newLines, orderId);
    await commitPartnerReservation(tx, partnerId, newLines, orderId);
    return;
  }

  throw new Error(`Partner stock reconcile not supported for order status: ${orderStatus}`);
}

export async function reassignReservedPartnerStock(input: {
  routedOrderId: string;
  oldPartnerId: string | null;
  newPartnerId: string;
  orderId: string;
  orderStatus: OrderStatus;
  lines: StockLine[];
  tx: PrismaTx;
}): Promise<void> {
  if (input.oldPartnerId === input.newPartnerId) return;

  if (input.oldPartnerId) {
    if (orderUsesPartnerReservationOnly(input.orderStatus)) {
      await releasePartnerReservation(input.tx, input.oldPartnerId, input.lines, input.orderId);
    } else {
      await restorePartnerCommittedStock(input.tx, input.oldPartnerId, input.lines, input.orderId);
    }
  }

  await reservePartnerStockForOrder(input.tx, input.newPartnerId, input.lines, input.orderId);
  if (!orderUsesPartnerReservationOnly(input.orderStatus)) {
    await commitPartnerReservation(input.tx, input.newPartnerId, input.lines, input.orderId);
  }
}
