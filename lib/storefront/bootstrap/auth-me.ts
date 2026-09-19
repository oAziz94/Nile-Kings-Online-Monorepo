import { getCurrentUser } from "@/lib/auth/session";
import { getSeniorStatus } from "@/lib/senior/verify";
import { prisma } from "@/lib/db";

export type AuthMeData = {
  userId: string;
  phone: string;
  name: string | null;
  role: string;
  seniorVerified: boolean;
  nationalIdLast4: string | null;
};

/**
 * Shared body of `GET /api/auth/me`, also used by `GET /api/storefront/bootstrap` (backlog 6.2).
 * Returns `null` for a guest — the auth/me route turns that into a 401, the bootstrap route
 * turns it into a `null` `user` field (guests are not an error there).
 */
export async function getAuthMeData(): Promise<AuthMeData | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { name: true, role: true },
  });
  let senior = { seniorVerified: false as boolean, nationalIdLast4: null as string | null };
  try {
    senior = await getSeniorStatus(user.userId);
  } catch {
    // SeniorVerification table may not exist yet or other transient error
  }
  return {
    userId: user.userId,
    phone: user.phone,
    name: dbUser?.name ?? null,
    role: dbUser?.role ?? user.role,
    seniorVerified: senior.seniorVerified,
    nationalIdLast4: senior.nationalIdLast4,
  };
}
