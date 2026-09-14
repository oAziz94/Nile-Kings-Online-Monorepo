/**
 * Pure stage → where-clause mapping for the admin's network-wide orders pipeline
 * (backlog 9.3 b, `docs/redesign/03-backlog.md` "9.3 — الطلبات"). Kept Prisma-type-only
 * (no runtime Prisma import) so `lib/admin/orders-list.test.ts` can assert the mapping
 * without a database.
 */
import type { OrderStatus, Prisma } from "@prisma/client";

export const ORDER_STAGE_STATUSES: readonly OrderStatus[] = [
  "CREATED",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

/** "" = الكل (every order); "UNASSIGNED" = بلا شريك (no partner, not yet terminal); any
 * other value is a real `OrderStatus`. */
export type OrdersListStage = "" | "UNASSIGNED" | OrderStatus;

export function parseStage(raw: string | null | undefined): OrdersListStage {
  const value = (raw ?? "").trim().toUpperCase();
  if (!value) return "";
  if (value === "UNASSIGNED") return "UNASSIGNED";
  return (ORDER_STAGE_STATUSES as readonly string[]).includes(value) ? (value as OrderStatus) : "";
}

/** بلا شريك = unassigned orders that have not reached a terminal status — an order that
 * was delivered or cancelled while unassigned (a manual/legacy edge case) does not linger
 * in this tab forever. */
export function stageWhereClause(stage: OrdersListStage): Prisma.OrderWhereInput {
  if (stage === "UNASSIGNED") {
    return { assignedPartnerId: null, status: { notIn: ["DELIVERED", "CANCELLED"] } };
  }
  if (stage === "") return {};
  return { status: stage };
}
