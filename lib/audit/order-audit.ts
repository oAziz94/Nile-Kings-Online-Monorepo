/**
 * Order audit log: record created, confirmed, cancelled, status_change.
 */

import { prisma } from "@/lib/db";

type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function logOrderCreated(tx: Tx, orderId: string): Promise<void> {
  await tx.orderAuditLog.create({
    data: {
      orderId,
      event: "created",
      statusTo: "CREATED",
    },
  });
}

export async function logOrderConfirmed(tx: Tx, orderId: string): Promise<void> {
  await tx.orderAuditLog.create({
    data: {
      orderId,
      event: "confirmed",
      statusFrom: "CREATED",
      statusTo: "CONFIRMED",
    },
  });
}

export async function logOrderCancelled(
  tx: Tx,
  orderId: string,
  reason?: string,
  statusFrom: string = "CREATED"
): Promise<void> {
  await tx.orderAuditLog.create({
    data: {
      orderId,
      event: "cancelled",
      statusFrom,
      statusTo: "CANCELLED",
      details: reason ? { cancellationReason: reason } : undefined,
    },
  });
}

export async function logOrderStatusChange(
  tx: Tx,
  orderId: string,
  from: string,
  to: string
): Promise<void> {
  await tx.orderAuditLog.create({
    data: {
      orderId,
      event: "status_change",
      statusFrom: from,
      statusTo: to,
    },
  });
}
