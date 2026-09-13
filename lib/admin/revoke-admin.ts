/**
 * Pure decision logic for revoking a user's ADMIN role (backlog 8.3).
 * Kept side-effect free so it can be unit-tested without touching the database —
 * the route (`app/api/admin/clients/[id]/revoke-admin/route.ts`) supplies the real
 * `adminCount` (count of all ADMIN users) and defers to this function for the verdict.
 */

export type RevokeAdminDecision =
  | { allowed: true }
  | { allowed: false; reason: "SELF" | "LAST_ADMIN" };

export function canRevokeAdmin(params: {
  targetId: string;
  callerId: string;
  adminCount: number;
}): RevokeAdminDecision {
  const { targetId, callerId, adminCount } = params;

  if (targetId === callerId) {
    return { allowed: false, reason: "SELF" };
  }

  if (adminCount <= 1) {
    return { allowed: false, reason: "LAST_ADMIN" };
  }

  return { allowed: true };
}
