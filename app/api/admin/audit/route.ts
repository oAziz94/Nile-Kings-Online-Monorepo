import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";

/**
 * GET /api/admin/audit — backlog 9.1 c. Newest-first, cursor-paginated read of
 * `AdminAuditLog`, filterable by entityType/entityId/actorUserId. Consumed by 9.2's
 * "آخر ما جرى" widget and 9.7's السجل screen; no UI in this task.
 *
 * Query params: entityType, entityId, actorUserId, cursor (an AdminAuditLog id), limit
 * (default 50, max 100).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? undefined;
  const entityId = searchParams.get("entityId") ?? undefined;
  const actorUserId = searchParams.get("actorUserId") ?? undefined;
  const cursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

  const items = await prisma.adminAuditLog.findMany({
    where: {
      ...(entityType && { entityType }),
      ...(entityId && { entityId }),
      ...(actorUserId && { actorUserId }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  });

  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return apiSuccess({ items: page, nextCursor });
}
