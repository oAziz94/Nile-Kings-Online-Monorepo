import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { getSeniorStatus } from "@/lib/senior/verify";
import { verifyAndStoreSeniorId } from "@/lib/senior/verify";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";

/**
 * GET /api/profile/senior
 * Returns senior verification status and masked last 4 of national ID (never full ID).
 * Auth required.
 */
export async function GET() {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }
  const status = await getSeniorStatus(user.userId);
  return apiSuccess(status);
}

/**
 * POST /api/profile/senior
 * Body: { nationalId: string } (14 digits)
 * Validates age >= 60, stores encrypted ID + fingerprint, returns masked last4.
 * Auth required.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }
  let body: { nationalId?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const nationalId = typeof body.nationalId === "string" ? body.nationalId.trim() : "";
  if (!nationalId) {
    return apiBadRequest("رقم الهوية الوطنية مطلوب");
  }
  const result = await verifyAndStoreSeniorId(user.userId, nationalId);
  if (!result.success) {
    return apiBadRequest(result.error);
  }
  return apiSuccess({ seniorVerified: true, nationalIdLast4: result.last4 });
}
