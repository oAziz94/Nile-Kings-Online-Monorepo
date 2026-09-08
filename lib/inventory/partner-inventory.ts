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

/** Variant IDs among `lines` that this partner cannot fully cover (empty array = can fulfill everything). */
async function getInsufficientVariantIds(partnerId: string, lines: StockLine[]): Promise<string[]> {
  const aggregated = aggregateStockLines(lines);
  if (aggregated.length === 0) return [];
  const rows = await prisma.partnerInventory.findMany({
    where: {
      partnerId,
      variantId: { in: aggregated.map((line) => line.variantId) },
    },
    select: { variantId: true, stockAvailable: true, stockReserved: true },
  });
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));
  return aggregated
    .filter((line) => {
      const row = byVariant.get(line.variantId);
      const sellable = row ? row.stockAvailable - row.stockReserved : 0;
      return sellable < line.quantity;
    })
    .map((line) => line.variantId);
}

export async function canPartnerFulfillLines(
  partnerId: string,
  lines: StockLine[]
): Promise<boolean> {
  const aggregated = aggregateStockLines(lines);
  if (aggregated.length === 0) return false;
  return (await getInsufficientVariantIds(partnerId, lines)).length === 0;
}

export type PartnerFulfillmentResult =
  | { ok: true; partnerId: string; ruleId: string; sequence: number; originGovernorate: string }
  | { ok: false; reason: "NO_PARTNER" }
  | { ok: false; reason: "INSUFFICIENT_STOCK"; insufficientVariantIds: string[] };

export async function findFulfillablePartnerForGovernorate(input: {
  governorate: string;
  lines: StockLine[];
  /**
   * Storefront's already-resolved partner (from the customer's chosen governorate cookie,
   * the same partner whose stock was shown while browsing/cart). When set, this partner is
   * authoritative — checked in isolation instead of re-deriving a partner from the delivery
   * address's governorate, which may differ (e.g. shipping to a relative in another
   * governorate) and would otherwise silently swap to a different partner than the one whose
   * stock the customer saw. It is NOT a hint with fallback: if this partner can't fully cover
   * the cart, the order fails hard naming the short items instead of silently trying other
   * partners the customer never saw stock for.
   */
  preferredPartnerId?: string | null;
}): Promise<PartnerFulfillmentResult> {
  if (input.preferredPartnerId) {
    const partner = await prisma.partner.findFirst({
      where: { id: input.preferredPartnerId, isActive: true },
      select: { id: true, governorate: true },
    });
    if (!partner) {
      return { ok: false, reason: "NO_PARTNER" };
    }
    const insufficientVariantIds = await getInsufficientVariantIds(partner.id, input.lines);
    if (insufficientVariantIds.length > 0) {
      return { ok: false, reason: "INSUFFICIENT_STOCK", insufficientVariantIds };
    }
    return {
      ok: true,
      partnerId: partner.id,
      ruleId: "",
      sequence: 0,
      originGovernorate: partner.governorate,
    };
  }

  const eligible = await getEligiblePartnersForGovernorate(input.governorate);
  if (eligible.length === 0) return { ok: false, reason: "NO_PARTNER" };

  const ordered = [...eligible];
  const lastId = eligible[0]?.rule.lastAssignedPartnerId;
  const lastIndex = lastId ? ordered.findIndex((entry) => entry.partner.id === lastId) : -1;
  if (lastIndex >= 0) {
    ordered.push(...ordered.splice(0, lastIndex + 1));
  }

  for (const entry of ordered) {
    if (await canPartnerFulfillLines(entry.partner.id, input.lines)) {
      const sequence = eligible.findIndex((item) => item.partner.id === entry.partner.id) + 1;
      return {
        ok: true,
        partnerId: entry.partner.id,
        ruleId: entry.rule.id,
        sequence: Math.max(1, sequence),
        originGovernorate: entry.partner.governorate,
      };
    }
  }

  return { ok: false, reason: "NO_PARTNER" };
}

/** One multi-row ledger insert instead of one round trip per line. */
async function writeLedgerBatch(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  reason: InventoryLedgerReason,
  orderId: string | null | undefined,
  deltasForLine: (quantity: number) => { availableDelta: number; reservedDelta: number },
  notes?: string | null
): Promise<void> {
  await tx.inventoryLedger.createMany({
    data: lines.map((line) => {
      const { availableDelta, reservedDelta } = deltasForLine(line.quantity);
      return {
        partnerId,
        variantId: line.variantId,
        reason,
        quantityAvailableDelta: availableDelta,
        quantityReservedDelta: reservedDelta,
        orderId: orderId ?? null,
        notes: notes ?? null,
      };
    }),
  });
}

export async function reservePartnerStockForOrder(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null,
  notes?: string | null
): Promise<void> {
  const aggregated = aggregateStockLines(lines);
  if (aggregated.length === 0) return;
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
  }

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "PartnerInventory" AS pi
      SET "stockReserved" = pi."stockReserved" + v.qty
      FROM (VALUES ${Prisma.join(
        aggregated.map((line) => Prisma.sql`(${line.variantId}::text, ${line.quantity}::int)`)
      )}) AS v(variant_id, qty)
      WHERE pi."partnerId" = ${partnerId} AND pi."variantId" = v.variant_id
    `
  );
  await writeLedgerBatch(
    tx,
    partnerId,
    aggregated,
    "ORDER_RESERVE",
    orderId,
    (quantity) => ({
      availableDelta: 0,
      reservedDelta: quantity,
    }),
    notes
  );
}

export async function commitPartnerReservation(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null,
  notes?: string | null
): Promise<void> {
  const aggregated = aggregateStockLines(lines);
  if (aggregated.length === 0) return;
  const variantIds = aggregated.map((line) => line.variantId);

  const rows = await tx.partnerInventory.findMany({
    where: { partnerId, variantId: { in: variantIds } },
    select: { id: true, variantId: true, stockReserved: true },
  });
  const byVariant = new Map(rows.map((row) => [row.variantId, row]));

  for (const line of aggregated) {
    const row = byVariant.get(line.variantId);
    const reserved = row?.stockReserved ?? 0;
    if (!row || reserved < line.quantity) {
      throw new InsufficientPartnerStockError(partnerId, line.variantId, line.quantity, reserved);
    }
  }

  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "PartnerInventory" AS pi
      SET "stockAvailable" = pi."stockAvailable" - v.qty,
          "stockReserved" = pi."stockReserved" - v.qty
      FROM (VALUES ${Prisma.join(
        aggregated.map((line) => Prisma.sql`(${line.variantId}::text, ${line.quantity}::int)`)
      )}) AS v(variant_id, qty)
      WHERE pi."partnerId" = ${partnerId} AND pi."variantId" = v.variant_id
    `
  );
  await writeLedgerBatch(
    tx,
    partnerId,
    aggregated,
    "ORDER_COMMIT",
    orderId,
    (quantity) => ({
      availableDelta: -quantity,
      reservedDelta: -quantity,
    }),
    notes
  );
}

export async function releasePartnerReservation(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null,
  notes?: string | null
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
      notes,
    });
  }
}

export async function restorePartnerCommittedStock(
  tx: PrismaTx,
  partnerId: string,
  lines: StockLine[],
  orderId?: string | null,
  notes?: string | null
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
      notes,
    });
  }
}

export async function reconcilePartnerStockForAdminOrderItemEdit(
  tx: PrismaTx,
  partnerId: string,
  orderStatus: OrderStatus,
  oldLines: StockLine[],
  newLines: StockLine[],
  orderId?: string | null,
  notes?: string | null
): Promise<void> {
  if (orderUsesPartnerReservationOnly(orderStatus)) {
    await releasePartnerReservation(tx, partnerId, oldLines, orderId, notes);
    await reservePartnerStockForOrder(tx, partnerId, newLines, orderId, notes);
    return;
  }

  if (["CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED"].includes(orderStatus)) {
    await restorePartnerCommittedStock(tx, partnerId, oldLines, orderId, notes);
    await reservePartnerStockForOrder(tx, partnerId, newLines, orderId, notes);
    await commitPartnerReservation(tx, partnerId, newLines, orderId, notes);
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
  notes?: string | null;
}): Promise<void> {
  if (input.oldPartnerId === input.newPartnerId) return;

  if (input.oldPartnerId) {
    if (orderUsesPartnerReservationOnly(input.orderStatus)) {
      await releasePartnerReservation(input.tx, input.oldPartnerId, input.lines, input.orderId, input.notes);
    } else {
      await restorePartnerCommittedStock(input.tx, input.oldPartnerId, input.lines, input.orderId, input.notes);
    }
  }

  await reservePartnerStockForOrder(input.tx, input.newPartnerId, input.lines, input.orderId, input.notes);
  if (!orderUsesPartnerReservationOnly(input.orderStatus)) {
    await commitPartnerReservation(input.tx, input.newPartnerId, input.lines, input.orderId, input.notes);
  }
}
