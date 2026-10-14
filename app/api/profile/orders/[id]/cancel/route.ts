import { requireCustomer } from "@/lib/auth/session";
import { apiSuccess, apiUnauthorized, apiNotFound, apiConflict } from "@/lib/api/response";
import { cancelInstaPayOrderByCustomer } from "@/lib/orders/instapay-customer";

/**
 * POST /api/profile/orders/[id]/cancel (backlog 10.50) — the customer cancels an InstaPay order
 * they have not paid yet. Guard: order belongs to the session user, INSTAPAY_PREPAID, CREATED,
 * PaymentAttempt still PENDING; anything else is 409 (404 for a foreign/unknown id). Releases
 * the partner reservation, logs the cancellation, sets `cancellationReason: "customer"`.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }
  const { id } = await params;
  const result = await cancelInstaPayOrderByCustomer({ orderId: id, userId: user.userId });
  if (!result.ok) return result.status === 404 ? apiNotFound(result.message) : apiConflict(result.message);
  return apiSuccess({ orderId: id, status: "CANCELLED" });
}
