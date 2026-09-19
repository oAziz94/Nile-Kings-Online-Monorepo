import { getAuthMeData } from "@/lib/storefront/bootstrap/auth-me";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * GET /api/auth/me
 * Returns current user if logged in (incl. seniorVerified, name), 401 if guest.
 */
export async function GET() {
  const data = await getAuthMeData();
  if (!data) {
    return apiUnauthorized("يجب تسجيل الدخول");
  }
  return apiSuccess(data);
}
