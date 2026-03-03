import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { productId?: string; variantId?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const { productId, variantId, sessionId } = body;

  if (!productId && !variantId) {
    return apiBadRequest("يجب تقديم productId أو variantId");
  }

  await prisma.viewLog.create({
    data: {
      productId: productId ?? (variantId ? (await prisma.variant.findUnique({ where: { id: variantId }, select: { productId: true } }))?.productId ?? null : null),
      variantId: variantId ?? null,
      sessionId: sessionId ?? null,
    },
  });

  return apiSuccess({ ok: true });
}
