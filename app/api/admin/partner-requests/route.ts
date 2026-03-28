import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
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
  const status = searchParams.get("status") as "PENDING" | "CONTACTED" | "APPROVED" | "REJECTED" | null;
  const requestType = searchParams.get("requestType") as "AGENT" | "DISTRIBUTOR" | null;
  const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const q = qRaw.length > 0 ? qRaw : undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const where: Prisma.PartnerRequestWhereInput = {};
  if (status && ["PENDING", "CONTACTED", "APPROVED", "REJECTED"].includes(status)) where.status = status;
  if (requestType && ["AGENT", "DISTRIBUTOR"].includes(requestType)) where.requestType = requestType;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { governorate: { contains: q, mode: "insensitive" } },
    ];
  }

  const [requests, total] = await Promise.all([
    prisma.partnerRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.partnerRequest.count({ where }),
  ]);

  return apiSuccess({ requests, total, limit, offset });
}
