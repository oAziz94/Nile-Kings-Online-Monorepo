import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { id } = await params;
  const user = await prisma.user.findFirst({
    where: { id, role: "CUSTOMER" },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      seniorVerified: true,
      createdAt: true,
      updatedAt: true,
      savedAddresses: true,
      orders: {
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          status: true,
          totalPiastres: true,
          paymentMethod: true,
          createdAt: true,
        },
      },
      _count: { select: { orders: true } },
    },
  });

  if (!user) return apiNotFound("العميل غير موجود");
  return apiSuccess(user);
}
