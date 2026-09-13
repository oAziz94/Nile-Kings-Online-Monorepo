import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * GET /api/profile/orders/summary — backlog 6.1. Feeds the navbar account menu's open-order
 * count and the mobile drawer's user card ("N طلبات جارية · M عناوين"). "Open" mirrors the
 * account-area canvas's progress track — everything before DELIVERED/CANCELLED.
 */
const OPEN_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED"] as const;

export async function GET() {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const [openCount, orderCount, addressCount] = await Promise.all([
    prisma.order.count({ where: { userId: user.userId, status: { in: [...OPEN_STATUSES] } } }),
    prisma.order.count({ where: { userId: user.userId } }),
    prisma.savedAddress.count({ where: { userId: user.userId } }),
  ]);

  return apiSuccess({ openCount, orderCount, addressCount });
}
