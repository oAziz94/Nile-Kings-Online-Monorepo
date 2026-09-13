import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { canRevokeAdmin } from "@/lib/admin/revoke-admin";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

/**
 * POST — set User.role to CUSTOMER. Mirror of grant-admin, but refuses to demote the
 * caller themselves and refuses to demote the last remaining ADMIN.
 */
export async function POST(_req: NextRequest, { params }: { params: Params }) {
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

  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  const decision = canRevokeAdmin({ targetId: user.id, callerId: caller.userId, adminCount });

  if (!decision.allowed) {
    if (decision.reason === "SELF") {
      return apiBadRequest("لا يمكنك إزالة صلاحياتك");
    }
    return apiBadRequest("لا يمكن إزالة آخر مسؤول");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "CUSTOMER" },
  });

  return apiSuccess({ userId: user.id, alreadyCustomer: false as const });
}
