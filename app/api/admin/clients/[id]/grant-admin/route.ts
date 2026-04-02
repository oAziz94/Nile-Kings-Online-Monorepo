import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

/**
 * POST — set User.role to ADMIN.
 */
export async function POST(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
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

  if (user.role === "ADMIN") {
    return apiSuccess({ userId: user.id, alreadyAdmin: true as const });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  return apiSuccess({ userId: user.id, alreadyAdmin: false as const });
}
