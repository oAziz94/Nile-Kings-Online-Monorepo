import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

/** GET /api/notifications/unread-count (backlog 10.34 d) — the bell's 30s poll (10.35) hits
 * this instead of the full list endpoint. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiUnauthorized("يجب تسجيل الدخول");

  const unreadCount = await prisma.notification.count({ where: { userId: user.userId, readAt: null } });
  return apiSuccess({ unreadCount });
}
