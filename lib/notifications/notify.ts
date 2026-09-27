/**
 * Notifications v1 dispatcher (backlog 10.34). One place that writes a `Notification` row per
 * recipient, called from inside the caller's own transaction so the notification never exists
 * without the business event that caused it (and never exists if that event's transaction rolls
 * back). In-app only — no channels, no delivery table, no cron sweep (that's the larger draft in
 * `docs/redesign/09-notifications-plan.md`, not this release).
 */
import type { Prisma } from "@prisma/client";
import type { NotificationKind } from "./kinds";

type Tx = Omit<Prisma.TransactionClient, "$transaction">;

export type NotifyAudience = "admins" | { userId: string };

export type NotifyInput = {
  audience: NotifyAudience;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  href: string;
  entity?: { type: string; id: string } | null;
};

/** Resolves `audience` to the list of recipient user ids — every ADMIN user for `"admins"`,
 * or the single given user for `{ userId }`. Exported so it's independently unit-testable. */
export async function resolveRecipientIds(tx: Tx, audience: NotifyAudience): Promise<string[]> {
  if (audience === "admins") {
    const admins = await tx.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    return admins.map((a) => a.id);
  }
  return [audience.userId];
}

/**
 * Writes one `Notification` row per resolved recipient. No-ops (no query at all) if resolution
 * yields zero recipients — e.g. an "admins" audience when somehow no ADMIN user exists.
 */
export async function notify(tx: Tx, input: NotifyInput): Promise<void> {
  const recipientIds = await resolveRecipientIds(tx, input.audience);
  if (recipientIds.length === 0) return;

  await tx.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      href: input.href,
      entityType: input.entity?.type ?? null,
      entityId: input.entity?.id ?? null,
    })),
  });
}
