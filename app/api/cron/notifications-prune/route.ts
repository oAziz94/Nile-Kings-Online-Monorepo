import { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/response";
import { pruneNotifications } from "@/lib/notifications/retention";

/**
 * `GET /api/cron/notifications-prune` (backlog 10.34 e) — scheduled daily in `vercel.json`,
 * a sibling of `/api/cron/stock-snapshot`. Deletes `Notification` rows older than 90 days.
 * Guarded by `Authorization: Bearer ${CRON_SECRET}`, same as the other cron route.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError("INTERNAL", "CRON_SECRET غير معرَّف في بيئة الخادم");
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return apiError("UNAUTHORIZED", "غير مصرح");
  }

  const { pruned } = await pruneNotifications();
  return apiSuccess({ pruned });
}
