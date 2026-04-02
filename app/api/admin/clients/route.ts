import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const where: {
    role: { in: ("CUSTOMER" | "ADMIN")[] };
    OR?: Array<{
      phone?: { contains: string; mode: "insensitive" };
      name?: { contains: string; mode: "insensitive" };
      email?: { contains: string; mode: "insensitive" };
    }>;
  } = { role: { in: ["CUSTOMER", "ADMIN"] } };
  if (q) {
    where.OR = [
      { phone: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  const [clients, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        phone: true,
        name: true,
        email: true,
        role: true,
        seniorVerified: true,
        createdAt: true,
        _count: { select: { orders: true, savedAddresses: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return apiSuccess({ clients, total, limit, offset });
}
