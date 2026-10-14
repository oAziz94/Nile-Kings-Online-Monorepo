import { requireCustomer } from "@/lib/auth/session";
import { apiSuccess, apiUnauthorized, apiNotFound, apiConflict } from "@/lib/api/response";
import { claimInstaPayTransfer } from "@/lib/orders/instapay-customer";

/**
 * POST /api/checkout/orders/[id]/instapay-claimed (backlog 10.50) — the customer pressed
 * "أتممت التحويل". Guard: order belongs to the session user, INSTAPAY_PREPAID, CREATED. Records
 * `PaymentAttempt.metadata.customerClaimedAt` (idempotent) for the admin's bank-app check.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }
  const { id } = await params;
  const result = await claimInstaPayTransfer({ orderId: id, userId: user.userId });
  if (!result.ok) return result.status === 404 ? apiNotFound(result.message) : apiConflict(result.message);
  return apiSuccess({ customerClaimedAt: result.customerClaimedAt });
}
