import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { variantId?: string; quantity?: number; sessionId?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const { variantId, quantity = 1, sessionId, userId } = body;

  if (!variantId) {
    return apiBadRequest("يجب تقديم variantId");
  }

  await prisma.addToCartLog.create({
    data: {
      variantId,
      quantity: Math.max(1, Math.min(quantity, 99)),
      sessionId: sessionId ?? null,
      userId: userId ?? null,
    },
  });

  return apiSuccess({ ok: true });
}
