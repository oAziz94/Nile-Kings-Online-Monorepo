import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  getCodFeePiastres,
  setCodFeePiastres,
  getCodFeePercent,
  setCodFeePercent,
} from "@/lib/settings";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const [codFeePiastres, codFeePercent] = await Promise.all([
    getCodFeePiastres(),
    getCodFeePercent(),
  ]);
  return apiSuccess({ codFeePiastres, codFeePercent });
}

export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  let body: { codFeePiastres?: number; codFeePercent?: number };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const [beforePiastres, beforePercent] = await Promise.all([getCodFeePiastres(), getCodFeePercent()]);
  if (body.codFeePiastres !== undefined) {
    if (typeof body.codFeePiastres !== "number" || body.codFeePiastres < 0) {
      return apiBadRequest("codFeePiastres يجب أن يكون عدداً غير سالب");
    }
    await setCodFeePiastres(body.codFeePiastres);
  }
  if (body.codFeePercent !== undefined) {
    if (typeof body.codFeePercent !== "number" || body.codFeePercent < 0 || body.codFeePercent > 100) {
      return apiBadRequest("codFeePercent يجب أن يكون بين 0 و 100");
    }
    await setCodFeePercent(body.codFeePercent);
  }
  const [codFeePiastres, codFeePercent] = await Promise.all([
    getCodFeePiastres(),
    getCodFeePercent(),
  ]);
  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "settings",
    entityId: "cod-fee",
    entityLabel: "رسوم الدفع عند الاستلام",
    before: { codFeePiastres: beforePiastres, codFeePercent: beforePercent },
    after: { codFeePiastres, codFeePercent },
    ip: requestIp(req),
  });
  return apiSuccess({ codFeePiastres, codFeePercent });
}
