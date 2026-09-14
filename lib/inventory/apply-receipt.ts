/**
 * `applyStockReceipt` (backlog 9.4a (b), B3) — the body of the original `POST
 * /api/partner/receipts` (validation of lines, cost snapshot via `computeUnitCostPiastres`
 * at the partner's rate at that moment, ledger entries, `totalCostPiastres`) lifted here so
 * both the partner route (`recordedBy: "PARTNER"`) and the new admin route
 * (`POST /api/admin/partners/[id]/receipts`, `recordedBy: "ADMIN"`) call the exact same
 * transaction instead of two copies drifting apart. Every applied line is a
 * read-lock-write under `SELECT … FOR UPDATE` (`04-decisions.md`'s 2026-09-12 rule); the
 * whole receipt is one `$transaction`, so any line's rejection rolls back the entire receipt.
 *
 * Duplicate `variantId`s within one `lines` array are MERGED, not rejected (see
 * `mergeReceiptLines`'s doc comment): FACTORY quantities are summed; COUNT quantities use the
 * LAST occurrence.
 */
import type { PrismaClient, StockReceiptKind, StockReceiptRecordedBy } from "@prisma/client";
import { computeUnitCostPiastres } from "@/lib/inventory/receipts";

export class ApplyReceiptError extends Error {
  constructor(public readonly publicMessage: string) {
    super(publicMessage);
  }
}

export const RESERVED_FLOOR_MESSAGE = (reserved: number) =>
  `لا يمكن أن يكون المخزون أقل من المحجوز (${reserved})`;

export type RawReceiptLine = { variantId?: unknown; quantity?: unknown };

/** Parses+validates the raw `lines` array from a request body. Returns `null` when malformed
 * (empty array, non-object entries, missing/blank `variantId`, non-integer `quantity`). */
export function parseReceiptLines(input: unknown): { variantId: string; quantity: number }[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: { variantId: string; quantity: number }[] = [];
  for (const raw of input as RawReceiptLine[]) {
    if (!raw || typeof raw !== "object") return null;
    const variantId = typeof raw.variantId === "string" ? raw.variantId.trim() : "";
    if (!variantId) return null;
    if (typeof raw.quantity !== "number" || !Number.isInteger(raw.quantity)) return null;
    out.push({ variantId, quantity: raw.quantity });
  }
  return out;
}

export function mergeReceiptLines(
  lines: { variantId: string; quantity: number }[],
  kind: "FACTORY" | "COUNT"
): { variantId: string; quantity: number }[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (kind === "FACTORY") {
      merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
    } else {
      merged.set(line.variantId, line.quantity); // COUNT: last occurrence wins
    }
  }
  return Array.from(merged.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
}

export type ApplyReceiptInput = {
  partnerId: string;
  kind: StockReceiptKind;
  /** Already parsed + merged (`parseReceiptLines` + `mergeReceiptLines`). */
  lines: { variantId: string; quantity: number }[];
  reference: string | null;
  notes: string | null;
  recordedBy: StockReceiptRecordedBy;
  /** The user who entered the receipt — the partner themselves, or the admin acting on
   * their behalf. Null only for legacy/rare cases; both current callers always pass one. */
  recordedByUserId: string | null;
};

/** Prisma's default interactive-transaction timeout is 5000ms; several concurrent receipts
 * touching the same variant serialise on that row's `SELECT … FOR UPDATE` (intended), so
 * under real contention a transaction can legitimately queue behind others long enough to
 * exceed the default. 15s comfortably covers a handful of queued receipts against Neon. */
export const APPLY_RECEIPT_TRANSACTION_TIMEOUT_MS = 15_000;

// Either the bare `prisma` client or a `$transaction` callback's `tx` handle — both expose
// the same model delegates `applyStockReceipt` needs.
type PrismaLike = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

export async function applyStockReceipt(tx: PrismaLike, input: ApplyReceiptInput) {
  const { partnerId, kind, lines, reference, notes, recordedBy, recordedByUserId } = input;

  if (kind === "FACTORY" && lines.some((l) => l.quantity <= 0)) {
    throw new ApplyReceiptError("كمية الاستلام يجب أن تكون رقماً صحيحاً موجباً");
  }
  if (kind === "COUNT" && lines.some((l) => l.quantity < 0)) {
    throw new ApplyReceiptError("الجرد الفعلي يجب أن يكون رقماً صحيحاً غير سالب");
  }

  const variants = await tx.variant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: { id: true, pricePiastres: true },
  });
  const priceByVariantId = new Map(variants.map((v) => [v.id, v.pricePiastres]));
  for (const line of lines) {
    if (!priceByVariantId.has(line.variantId)) throw new ApplyReceiptError("المتغير غير موجود");
  }

  // Settlement cost snapshot (backlog 5.1) — FACTORY lines only; a COUNT receipt never
  // creates a cost. Snapshotted from the partner's rate *at apply time* so a later rate
  // change never rewrites this receipt's history.
  let costRateBps: number | null = null;
  if (kind === "FACTORY") {
    const partnerRow = await tx.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: { costRateBps: true },
    });
    costRateBps = partnerRow.costRateBps;
  }
  let totalCostPiastres = 0;

  const created = await tx.stockReceipt.create({
    data: { partnerId, kind, reference, notes, recordedBy, recordedByUserId },
  });

  for (const line of lines) {
    await tx.partnerInventory.upsert({
      where: { partnerId_variantId: { partnerId, variantId: line.variantId } },
      update: {},
      create: { partnerId, variantId: line.variantId, stockAvailable: 0, stockReserved: 0 },
    });
    const [locked] = await tx.$queryRaw<{ stockAvailable: number; stockReserved: number }[]>`
      SELECT "stockAvailable", "stockReserved"
      FROM "PartnerInventory"
      WHERE "partnerId" = ${partnerId} AND "variantId" = ${line.variantId}
      FOR UPDATE
    `;
    const previousAvailable = locked.stockAvailable;
    const stockReserved = locked.stockReserved;

    let newAvailable: number;
    let availableDelta: number;
    if (kind === "FACTORY") {
      newAvailable = previousAvailable + line.quantity;
      availableDelta = line.quantity;
    } else {
      newAvailable = line.quantity;
      if (newAvailable < stockReserved) {
        throw new ApplyReceiptError(RESERVED_FLOOR_MESSAGE(stockReserved));
      }
      availableDelta = newAvailable - previousAvailable;
    }

    await tx.partnerInventory.update({
      where: { partnerId_variantId: { partnerId, variantId: line.variantId } },
      data: { stockAvailable: newAvailable },
    });

    let unitCostPiastres: number | null = null;
    if (kind === "FACTORY" && costRateBps !== null) {
      const pricePiastres = priceByVariantId.get(line.variantId) ?? 0;
      unitCostPiastres = computeUnitCostPiastres(pricePiastres, costRateBps);
      totalCostPiastres += unitCostPiastres * line.quantity;
    }

    await tx.stockReceiptLine.create({
      data: {
        receiptId: created.id,
        variantId: line.variantId,
        quantity: line.quantity,
        previousAvailable,
        newAvailable,
        unitCostPiastres,
      },
    });

    await tx.inventoryLedger.create({
      data: {
        partnerId,
        variantId: line.variantId,
        reason: kind === "FACTORY" ? "FACTORY_RECEIPT" : "STOCK_COUNT",
        quantityAvailableDelta: availableDelta,
        quantityReservedDelta: 0,
        stockReceiptId: created.id,
        notes: kind === "FACTORY" ? "Factory receipt" : "Stock count",
      },
    });
  }

  if (kind === "FACTORY") {
    await tx.stockReceipt.update({
      where: { id: created.id },
      data: { totalCostPiastres },
    });
  }

  return tx.stockReceipt.findUniqueOrThrow({
    where: { id: created.id },
    include: { lines: { include: { variant: { select: { sku: true, name: true } } } } },
  });
}
