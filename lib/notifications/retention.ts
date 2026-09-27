/**
 * `Notification` retention (backlog 10.34 e) — rows older than 90 days are pruned, run/read
 * regardless of `readAt` (unlike `AdminAuditLog`'s money/stock carve-out, nothing here is kept
 * forever: a notification's only job is to surface something new, and the underlying event
 * stays visible on the order/ticket itself long after this row is gone).
 */
import { prisma } from "@/lib/db";

export const NOTIFICATION_RETENTION_DAYS = 90;

export async function pruneNotifications(now: Date = new Date()): Promise<{ pruned: number }> {
  const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.notification.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return { pruned: result.count };
}
