/**
 * Stock line helpers shared across the order/inventory modules.
 *
 * Historically this module also reserved/committed/released stock directly on
 * `Variant.stockAvailable`/`stockReserved` for orders with no assigned partner. Backlog 9.9
 * ("Retire the legacy variant stock columns") dropped those two columns — stock now lives only
 * in `PartnerInventory` (`lib/inventory/partner-inventory.ts`, which every order-creating path
 * already used: `lib/checkout/place-order.ts` always resolves and reserves against a partner
 * before an order is created, and admin order writes call the partner-scoped functions whenever
 * `assignedPartnerId` is set). The Variant-level functions this module used to export
 * (`reserveStockForOrder`, `commitReservation`, `releaseReservation`, `restoreCommittedStock`,
 * `decrementSellableStock`, `reconcileStockForAdminOrderItemEdit`, `orderUsesReservationOnly`,
 * `InsufficientStockError`) are gone with the columns they mutated; the one remaining caller of
 * the "no assigned partner" fallback (`app/api/admin/orders/[id]/route.ts`) now refuses that
 * edit instead, since there is no longer anywhere to hold or release stock for an order with no
 * partner.
 */

export type StockLine = {
  variantId: string;
  quantity: number;
};

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
