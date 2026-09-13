import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canRevokeAdmin } from "@/lib/admin/revoke-admin";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

type Params = Promise<{ id: string }>;

/**
 * POST — set User.role to CUSTOMER. Mirror of grant-admin, but refuses to demote the
 * caller themselves and refuses to demote the last remaining ADMIN.
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  let caller;
  try {
    caller = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, phone: true, role: true },
  });

  if (!user) return apiNotFound("المستخدم غير موجود");

  if (user.role !== "ADMIN") {
    return apiSuccess({ userId: user.id, alreadyCustomer: true as const });
  }

  // Count, decide and update inside one transaction with every ADMIN row locked, so two
  // concurrent revokes of the last two admins cannot both pass the last-admin check and leave
  // the site with no admin (verifier, 8.3) — same FOR UPDATE rule as lockOrderAtStatus.
  const result = await prisma.$transaction(async (tx) => {
    const admins = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "role" = 'ADMIN'::"UserRole" FOR UPDATE`;
    if (!admins.some((a) => a.id === user.id)) {
      return { kind: "already" as const };
    }
    const decision = canRevokeAdmin({ targetId: user.id, callerId: caller.userId, adminCount: admins.length });
    if (!decision.allowed) {
      return { kind: "refused" as const, reason: decision.reason };
    }
    await tx.user.update({ where: { id: user.id }, data: { role: "CUSTOMER" } });
    await logAdminAction(tx, {
      actor: caller,
      action: "revoke_admin",
      entityType: "user",
      entityId: user.id,
      entityLabel: user.phone,
      ip: requestIp(req),
    });
    return { kind: "revoked" as const };
  });

  if (result.kind === "already") {
    return apiSuccess({ userId: user.id, alreadyCustomer: true as const });
  }
  if (result.kind === "refused") {
    if (result.reason === "SELF") {
      return apiBadRequest("لا يمكنك إزالة صلاحياتك");
    }
    return apiBadRequest("لا يمكن إزالة آخر مسؤول");
  }

  return apiSuccess({ userId: user.id, alreadyCustomer: false as const });
}
