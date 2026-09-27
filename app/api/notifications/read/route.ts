import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * POST /api/notifications/read — `{ ids: string[] }` or `{ all: true }` (backlog 10.34 d).
 * Every update is scoped to `userId: user.userId` in the `where` clause itself — a caller can
 * never mark another user's row read regardless of what ids it sends (this is the "a partner
 * cannot read an admin's rows" guarantee, enforced by the filter rather than a 403 lookup).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiUnauthorized("يجب تسجيل الدخول");

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (body.all === true) {
    const result = await prisma.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return apiSuccess({ updated: result.count });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];
  if (ids.length === 0) {
    return apiBadRequest("ids أو all مطلوب");
  }

  const result = await prisma.notification.updateMany({
    where: { userId: user.userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return apiSuccess({ updated: result.count });
}
