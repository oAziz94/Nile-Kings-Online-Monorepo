/**
 * `AdminAuditLog` retention (backlog 9.7 (f), `06-admin-v2.md` §3.9: "kept forever for money
 * and stock; the rest pruned after 400 days"). The money/stock set is `entityType` values only
 * — defined once here so the cron and its test share one source of truth.
 */
import { prisma } from "@/lib/db";

export const AUDIT_RETENTION_DAYS = 400;

/** `entityType`s kept forever (money/stock never pruned). "order" is deliberately excluded
 * here: most order actions (assign, ticket replies, notes) are not money/stock, and an order
 * row's `action` (not its `entityType`) is what tells the two apart — see `isMoneyOrStockRow`. */
export const AUDIT_RETENTION_KEPT_FOREVER_ENTITY_TYPES = ["receipt", "payment", "inventory"] as const;

/** `Order`-entity actions that ARE money/stock (status transitions move stock; cancellation
 * releases it) — kept forever alongside the entity types above. Every other order action
 * (assign/reassign, ticket replies, notes, proof-of-delivery) is prunable. */
const ORDER_MONEY_OR_STOCK_ACTIONS = new Set(["status_change", "update"]);

export function isMoneyOrStockRow(row: { entityType: string; action: string }): boolean {
  if ((AUDIT_RETENTION_KEPT_FOREVER_ENTITY_TYPES as readonly string[]).includes(row.entityType)) return true;
  if (row.entityType === "order" && ORDER_MONEY_OR_STOCK_ACTIONS.has(row.action)) return true;
  return false;
}

/**
 * Deletes `AdminAuditLog` rows older than `AUDIT_RETENTION_DAYS` whose entity/action is not in
 * the money/stock set. Run from the daily cron (`app/api/cron/stock-snapshot/route.ts`).
 */
export async function pruneAdminAuditLog(now: Date = new Date()): Promise<{ pruned: number }> {
  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const keptEntityTypes = [...AUDIT_RETENTION_KEPT_FOREVER_ENTITY_TYPES];
  const result = await prisma.adminAuditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      entityType: { notIn: keptEntityTypes },
      NOT: { entityType: "order", action: { in: Array.from(ORDER_MONEY_OR_STOCK_ACTIONS) } },
    },
  });
  return { pruned: result.count };
}
