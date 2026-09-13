/**
 * Admin audit log writer (backlog 9.1 c, `docs/redesign/06-admin-v2.md` §3.9 + §6 rule B1):
 * every admin write that changes money, stock, status, catalog, routing, roles or a setting
 * appends one `AdminAuditLog` row. In the style of `lib/audit/order-audit.ts` — a thin
 * `tx.adminAuditLog.create` wrapper, callable with either the bare `prisma` client or a
 * transaction handle, so callers can log inside the same transaction as the write it
 * describes when one exists.
 */
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

type Tx = Omit<
  typeof prisma,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export type AuditDiff = { before: Record<string, unknown>; after: Record<string, unknown> } | null;

/** Round-trips a Prisma row through JSON so `Date`/`Decimal`/etc. become plain JSON values
 * before being compared or stored in a `Json` column (callers pass raw Prisma rows).
 * `omit` drops volatile, audit-irrelevant columns (e.g. an `@updatedAt` timestamp) that would
 * otherwise always show up as "changed" even when nothing meaningful did. */
export function sanitizeForAudit<T extends Record<string, unknown>>(
  record: T,
  omit: readonly string[] = []
): Record<string, unknown> {
  const plain = JSON.parse(JSON.stringify(record)) as Record<string, unknown>;
  for (const key of omit) delete plain[key];
  return plain;
}

/**
 * Keeps only the keys whose value actually changed between `before` and `after` (compared
 * by JSON equality — nested objects/arrays included), so the stored row is the change, never
 * the whole record. A key present on only one side counts as changed. Returns `null` when
 * nothing changed (including when both inputs are empty/undefined).
 */
export function auditDiff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): AuditDiff {
  const b = before ?? {};
  const a = after ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  let changed = false;

  for (const key of keys) {
    const hasBefore = Object.prototype.hasOwnProperty.call(b, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(a, key);
    if (hasBefore !== hasAfter || JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
      changed = true;
      changedBefore[key] = b[key];
      changedAfter[key] = a[key];
    }
  }

  if (!changed) return null;
  return { before: changedBefore, after: changedAfter };
}

/** `x-forwarded-for`'s first hop, or null when absent (local dev, direct connection). */
export function requestIp(req: NextRequest | Request): string | null {
  const header = req.headers.get("x-forwarded-for");
  if (!header) return null;
  const first = header.split(",")[0]?.trim();
  return first || null;
}

export type LogAdminActionInput = {
  actor: SessionUser;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  ip?: string | null;
};

/**
 * Writes one `AdminAuditLog` row. When both `before` and `after` are provided, the row only
 * stores the diff (via `auditDiff`); if the diff is empty (nothing actually changed) AND no
 * `reason` was given, the write is skipped — a no-op PATCH should not spam the log. Actions
 * with no before/after pair (grant_admin, revoke_admin, create, delete) always write, since
 * the action itself is the record.
 */
export async function logAdminAction(tx: Tx, input: LogAdminActionInput): Promise<void> {
  const { actor, action, entityType, entityId, entityLabel, before, after, reason, ip } = input;

  let diffBefore: Record<string, unknown> | null | undefined = before;
  let diffAfter: Record<string, unknown> | null | undefined = after;

  const isDiffPair = before !== undefined && after !== undefined && before !== null && after !== null;
  if (isDiffPair) {
    const diff = auditDiff(before, after);
    if (!diff && !reason) return;
    diffBefore = diff?.before ?? null;
    diffAfter = diff?.after ?? null;
  }

  await tx.adminAuditLog.create({
    data: {
      actorUserId: actor.userId,
      actorRole: actor.role,
      action,
      entityType,
      entityId,
      entityLabel: entityLabel ?? null,
      before: diffBefore === undefined ? undefined : (diffBefore as never),
      after: diffAfter === undefined ? undefined : (diffAfter as never),
      reason: reason ?? null,
      ip: ip ?? null,
    },
  });
}
