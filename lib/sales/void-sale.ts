import { Prisma } from "@prisma/client";
import type { PrismaTx } from "@/lib/inventory/partner-inventory";
import { cairoDateIso, cairoStartOfDayUtc } from "@/lib/analytics/cairo-day";
import { StoreSaleError } from "@/lib/sales/create-sale";

/**
 * Void a counter sale (backlog 11.4, plan 12 D2/D6). One writer shared by the outlet route and the
 * admin route (`actor`). Same fixed lock order as `createStoreSale`:
 *   1. `Partner` row FOR UPDATE (serialises with sales and other voids of this outlet, so the
 *      status check below cannot race a second void)
 *   2. the sale's `PartnerInventory` rows FOR UPDATE, ORDER BY variantId
 * then stock goes back per line, one `STORE_SALE_VOID` ledger line per line
 * (`store-sale-void:<id> · إيصال N`), and the sale becomes VOIDED. The receipt number stays on the
 * row, so it is never reused (`createStoreSale` takes max+1 over every status).
 */

export const VOID_REASON_MIN = 3;
export const VOID_REASON_MAX = 200;
export const VOID_TODAY_ONLY_MESSAGE = "يمكن إلغاء إيصال اليوم فقط";

export type VoidActor = "OUTLET" | "ADMIN";

export function validateVoidReason(raw: unknown): { ok: true; reason: string } | { ok: false; message: string } {
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length < VOID_REASON_MIN || reason.length > VOID_REASON_MAX) {
    return { ok: false, message: `سبب الإلغاء يجب أن يكون بين ${VOID_REASON_MIN} و ${VOID_REASON_MAX} حرفاً` };
  }
  return { ok: true, reason };
}

/** True when `soldAt` falls before 00:00 Africa/Cairo of the day containing `now`. */
export function isBeforeCairoToday(soldAt: Date, now: Date = new Date()): boolean {
  return soldAt.getTime() < cairoStartOfDayUtc(cairoDateIso(now)).getTime();
}

export async function voidStoreSale(
  tx: PrismaTx,
  input: { partnerId: string; saleId: string; reason: string; actor: VoidActor; now?: Date }
) {
  const { partnerId, saleId, actor } = input;
  const now = input.now ?? new Date();
  const checked = validateVoidReason(input.reason);
  if (!checked.ok) throw new StoreSaleError(400, checked.message);

  // 1. partner row lock
  const partnerRows = await tx.$queryRaw<{ id: string; partnerType: string }[]>(
    Prisma.sql`SELECT id, "partnerType" FROM "Partner" WHERE id = ${partnerId} FOR UPDATE`
  );
  const partnerRow = partnerRows[0];
  if (!partnerRow) throw new StoreSaleError(404, "غير موجود");
  if (partnerRow.partnerType !== "DISTRIBUTOR") throw new StoreSaleError(403, "هذه الصفحة متاحة للمنافذ فقط");

  const sale = await tx.storeSale.findFirst({
    where: { id: saleId, partnerId },
    include: { items: true },
  });
  if (!sale) throw new StoreSaleError(404, "الإيصال غير موجود");
  if (sale.status !== "COMPLETED") throw new StoreSaleError(409, "الإيصال ملغي بالفعل");
  if (actor === "OUTLET" && isBeforeCairoToday(sale.soldAt, now)) {
    throw new StoreSaleError(403, VOID_TODAY_ONLY_MESSAGE);
  }

  // 2. inventory row locks, deterministic order
  const variantIds = Array.from(new Set(sale.items.map((i) => i.variantId))).sort();
  const lockedRows = variantIds.length
    ? await tx.$queryRaw<{ variantId: string }[]>(
        Prisma.sql`
          SELECT "variantId"
          FROM "PartnerInventory"
          WHERE "partnerId" = ${partnerId} AND "variantId" IN (${Prisma.join(variantIds)})
          ORDER BY "variantId"
          FOR UPDATE
        `
      )
    : [];
  const existing = new Set(lockedRows.map((r) => r.variantId));

  for (const item of sale.items) {
    if (existing.has(item.variantId)) {
      await tx.partnerInventory.update({
        where: { partnerId_variantId: { partnerId, variantId: item.variantId } },
        data: { stockAvailable: { increment: item.quantity } },
      });
    } else {
      // The stock row was removed after the sale: recreate it so the units are not lost.
      await tx.partnerInventory.create({
        data: { partnerId, variantId: item.variantId, stockAvailable: item.quantity, stockReserved: 0 },
      });
      existing.add(item.variantId);
    }
    await tx.inventoryLedger.create({
      data: {
        partnerId,
        variantId: item.variantId,
        reason: "STORE_SALE_VOID",
        quantityAvailableDelta: item.quantity,
        quantityReservedDelta: 0,
        notes: `store-sale-void:${sale.id} · إيصال ${sale.receiptNo}`,
      },
    });
  }

  return tx.storeSale.update({
    where: { id: sale.id },
    data: { status: "VOIDED", voidedAt: now, voidReason: checked.reason },
    include: { items: true },
  });
}
