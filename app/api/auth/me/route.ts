import { getCurrentUser } from "@/lib/auth/session";
import { getSeniorStatus } from "@/lib/senior/verify";
import { apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { prisma } from "@/lib/db";

/**
 * GET /api/auth/me
 * Returns current user if logged in (incl. seniorVerified, name), 401 if guest.
 * If senior status fails (e.g. DB not migrated), still return user so header dropdown works.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiUnauthorized("يجب تسجيل الدخول");
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true },
  });
  let senior = { seniorVerified: false as boolean, nationalIdLast4: null as string | null };
  try {
    senior = await getSeniorStatus(user.userId);
  } catch {
    // SeniorVerification table may not exist yet or other transient error
  }
  return apiSuccess({
    userId: user.userId,
    phone: user.phone,
    name: dbUser?.name ?? null,
    role: user.role,
    seniorVerified: senior.seniorVerified,
    nationalIdLast4: senior.nationalIdLast4,
  });
}
