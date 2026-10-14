import { getSessionUserIdFromJwt } from "@/lib/auth/session";
import { getUnreadCountCached } from "@/lib/notifications/unread-cache";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

/** GET /api/notifications/unread-count (backlog 10.34 d) — the bell's 20s poll (10.35).
 * Backlog 10.52: identity from the JWT only and the count from Redis, so a cache hit makes zero
 * Postgres queries (Neon can sleep while a dashboard tab is open). */
export async function GET() {
  const userId = await getSessionUserIdFromJwt();
  if (!userId) return apiUnauthorized("يجب تسجيل الدخول");

  const unreadCount = await getUnreadCountCached(userId);
  return apiSuccess({ unreadCount });
}
