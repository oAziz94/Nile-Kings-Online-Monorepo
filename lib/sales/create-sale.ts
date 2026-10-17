import { Prisma } from "@prisma/client";
import type { PrismaTx } from "@/lib/inventory/partner-inventory";
import { nextReceiptNo } from "@/lib/sales/receipt-number";
import type { SaleInput } from "@/lib/sales/validation";

/**
 * The one writer of `StoreSale` (backlog 11.3). One transaction, fixed lock order:
 *   1. `Partner` row FOR UPDATE (serialises this outlet's sales; makes receiptNo max+1 safe)
 *   2. the outlet's `PartnerInventory` rows for the sold variants FOR UPDATE, ORDER BY variantId
 * then read variants, check sellable (stockAvailable - stockReserved), insert sale + items,
 * decrement stock and write one STORE_SALE ledger line per sold variant.
 * The ledger has no sale FK column (no schema change in 11.3), so the sale id travels in `notes`
 * as `store-sale:<id>`.
 */

export const SALE_TRANSACTION_TIMEOUT_MS = 15_000;

export type ShortLine = { variantId: string; label: string; available: number };

export class StoreSaleError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    public readonly publicMessage: string,
    public readonly shortLines?: ShortLine[]
  ) {
    super(publicMessage);
    this.name = "StoreSaleError";
  }
}

export function shortStockMessage(lines: { label: string; available: number }[]): string {
  return lines.map((l) => `المتاح من ${l.label} ${l.available} فقط`).join("، ");
}

export async function createStoreSale(
  tx: PrismaTx,
  input: { partnerId: string; recordedByUserId: string | null; sale: SaleInput }
) {
  const { partnerId, recordedByUserId, sale } = input;

  // 1. partner row lock
  const partnerRows = await tx.$queryRaw<{ id: string; partnerType: string }[]>(
    Prisma.sql`SELECT id, "partnerType" FROM "Partner" WHERE id = ${partnerId} FOR UPDATE`
  );
  const partnerRow = partnerRows[0];
  if (!partnerRow) throw new StoreSaleError(404, "غير موجود");
  if (partnerRow.partnerType !== "DISTRIBUTOR") throw new StoreSaleError(403, "هذه الصفحة متاحة للمنافذ فقط");

  // 2. inventory row locks, deterministic order
  const variantIds = sale.items.map((i) => i.variantId);
  const stockRows = await tx.$queryRaw<{ variantId: string; stockAvailable: number; stockReserved: number }[]>(
    Prisma.sql`
      SELECT "variantId", "stockAvailable", "stockReserved"
      FROM "PartnerInventory"
      WHERE "partnerId" = ${partnerId} AND "variantId" IN (${Prisma.join(variantIds)})
      ORDER BY "variantId"
      FOR UPDATE
    `
  );
  const stockByVariant = new Map(stockRows.map((r) => [r.variantId, r]));

  const variants = await tx.variant.findMany({
    where: { id: { in: variantIds } },
    select: {
      id: true,
      sku: true,
      name: true,
      colorName: true,
      pricePiastres: true,
      product: { select: { name: true } },
    },
  });
  const variantById = new Map(variants.map((v) => [v.id, v]));
  if (variantIds.some((id) => !variantById.has(id))) throw new StoreSaleError(400, "المتغير غير موجود");

  const labelOf = (v: { name: string; colorName: string | null; product: { name: string } }) =>
    `${v.product.name} — ${v.name}${v.colorName ? ` – ${v.colorName}` : ""}`;

  const short: ShortLine[] = [];
  for (const item of sale.items) {
    const row = stockByVariant.get(item.variantId);
    const available = row ? Math.max(0, row.stockAvailable - row.stockReserved) : 0;
    if (item.quantity > available) {
      short.push({ variantId: item.variantId, label: labelOf(variantById.get(item.variantId)!), available });
    }
  }
  if (short.length > 0) throw new StoreSaleError(409, shortStockMessage(short), short);

  // 3. receipt number under the partner lock
  const agg = await tx.storeSale.aggregate({ where: { partnerId }, _max: { receiptNo: true } });
  const receiptNo = nextReceiptNo(agg._max.receiptNo);

  const subtotalPiastres = sale.items.reduce(
    (sum, i) => sum + i.quantity * variantById.get(i.variantId)!.pricePiastres,
    0
  );

  const created = await tx.storeSale.create({
    data: {
      partnerId,
      receiptNo,
      paymentMethod: sale.paymentMethod,
      customerPhone: sale.customerPhone,
      customerName: sale.customerName,
      sellerName: sale.sellerName,
      notes: sale.notes,
      subtotalPiastres,
      recordedByUserId,
      items: {
        create: sale.items.map((i) => {
          const v = variantById.get(i.variantId)!;
          return {
            variantId: v.id,
            quantity: i.quantity,
            unitPricePiastres: v.pricePiastres,
            productName: v.product.name,
            variantName: v.colorName ? `${v.name} – ${v.colorName}` : v.name,
            sku: v.sku,
          };
        }),
      },
    },
    include: { items: true },
  });

  for (const item of sale.items) {
    await tx.partnerInventory.update({
      where: { partnerId_variantId: { partnerId, variantId: item.variantId } },
      data: { stockAvailable: { decrement: item.quantity } },
    });
    await tx.inventoryLedger.create({
      data: {
        partnerId,
        variantId: item.variantId,
        reason: "STORE_SALE",
        quantityAvailableDelta: -item.quantity,
        quantityReservedDelta: 0,
        notes: `store-sale:${created.id} · إيصال ${receiptNo}`,
      },
    });
  }

  return created;
}
