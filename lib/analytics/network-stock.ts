/**
 * مخزون الشبكة (backlog 9.5b, `06-admin-v2.md` §3.4) — every active partner × every SKU,
 * built on top of `computeInventoryRows` (the partner inventory report's own per-partner
 * query, rule B3: no fresh stock query) called once per active partner in parallel, then
 * flattened with the partner attached and the threshold resolved per row via
 * `resolveThreshold(partnerId).forVariant(...)` (the 9.2 note this task is here to honour —
 * the الحد column is the *resolved* per-category/per-product threshold, not the partner's
 * bare default).
 */
import { prisma } from "@/lib/db";
import { computeInventoryRows, type InventorySkuRow } from "./partner-inventory-report";
import { resolvePeriod } from "./partner-reports";
import { resolveThreshold } from "@/lib/partner/resolve-threshold";

export type NetworkStockStatus = "out" | "low" | "ok";

export type NetworkStockRow = InventorySkuRow & {
  partnerId: string;
  partnerName: string;
  threshold: number;
  status: NetworkStockStatus;
};

export function computeNetworkStockStatus(sellable: number, threshold: number): NetworkStockStatus {
  if (sellable <= 0) return "out";
  if (sellable <= threshold) return "low";
  return "ok";
}

/**
 * Backlog 9.10 (from the 9.5b close-out) — a 60-second in-memory cache, keyed by the latest
 * `InventoryLedger.id` (every stock-affecting write appends a ledger row, per the standing
 * inventory rule, so a new id means the numbers below may have changed) plus the TTL as a
 * backstop for the writes this key doesn't cover (a threshold edit, a partner activated/
 * deactivated — neither touches the ledger). Process-local only: correct on the single
 * long-running dev/prod server this runs on today, not across serverless instances — a real
 * cache layer (shared, invalidated precisely) is Phase 6's call, not this task's.
 */
const NETWORK_STOCK_CACHE_TTL_MS = 60_000;
let networkStockCache: { ledgerKey: string; expiresAt: number; value: NetworkStockRow[] } | null = null;

async function computeNetworkStockRows(): Promise<NetworkStockRow[]> {
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });
  const period = resolvePeriod({ preset: "30d" });

  const perPartner = await Promise.all(
    partners.map(async (partner) => {
      const [{ rows }, threshold] = await Promise.all([
        computeInventoryRows(partner.id, period),
        resolveThreshold(partner.id),
      ]);
      return rows.map((row): NetworkStockRow => {
        const resolved = threshold.forVariant({ productId: row.productId, categoryId: row.categoryId });
        return {
          ...row,
          partnerId: partner.id,
          partnerName: partner.name,
          threshold: resolved,
          status: computeNetworkStockStatus(row.sellable, resolved),
        };
      });
    })
  );

  return perPartner.flat();
}

/** Every SKU row across every active partner, unfiltered/unsorted/unpaginated — the API
 * route applies filters, sort and pagination on top of this. */
export async function getNetworkStockRows(): Promise<NetworkStockRow[]> {
  const latestLedger = await prisma.inventoryLedger.findFirst({ orderBy: { id: "desc" }, select: { id: true } });
  const ledgerKey = latestLedger?.id ?? "none";
  const now = Date.now();

  if (networkStockCache && networkStockCache.ledgerKey === ledgerKey && networkStockCache.expiresAt > now) {
    return networkStockCache.value;
  }

  const value = await computeNetworkStockRows();
  networkStockCache = { ledgerKey, expiresAt: now + NETWORK_STOCK_CACHE_TTL_MS, value };
  return value;
}

/** Test-only: clears the in-process cache so a unit test doesn't leak state into the next. */
export function _resetNetworkStockCacheForTests(): void {
  networkStockCache = null;
}
