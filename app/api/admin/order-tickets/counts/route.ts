import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";

/**
 * GET /api/admin/order-tickets/counts — the OPEN/ANSWERED/CLOSED counts alone, for the admin
 * shell's nav badge (backlog 6.5b). The inbox page itself gets the same counts inline in its
 * list response; this is the lightweight call the shell makes on every admin page.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const [open, answered, closed] = await Promise.all([
    prisma.orderTicket.count({ where: { status: "OPEN" } }),
    prisma.orderTicket.count({ where: { status: "ANSWERED" } }),
    prisma.orderTicket.count({ where: { status: "CLOSED" } }),
  ]);

  return apiSuccess({ open, answered, closed });
}
