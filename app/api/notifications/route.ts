import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * GET /api/notifications?filter=unread|all&cursor=&limit=20 (backlog 10.34 d) — session-scoped
 * to the current user only, shared by both dashboards (admin and partner alike; a user only
 * ever sees rows written to their own `userId`, so there is no separate admin/partner branch
 * here). `{ items, unreadCount, nextCursor }`.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiUnauthorized("يجب تسجيل الدخول");

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get("filter") === "unread" ? "unread" : "all";
  const cursor = searchParams.get("cursor");
  const limitParam = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;

  const where = {
    userId: user.userId,
    ...(filter === "unread" ? { readAt: null } : {}),
  };

  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
  ]);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return apiSuccess({ items, unreadCount, nextCursor });
}
