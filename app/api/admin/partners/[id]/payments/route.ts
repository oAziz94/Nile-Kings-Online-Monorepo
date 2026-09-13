import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * `GET`/`POST /api/admin/partners/[id]/payments` (backlog 5.1 admin minimum — "record a
 * partner payment"). Admin-recorded only, per `05-partner-portal-v2.md` §1 "Settlement
 * model": a down payment links to the `StockReceipt` it was paid against; an installment
 * may carry a `dueAt` so the Money report can show "القسط القادم". Partners only read
 * this (their settings page's read-only block, later the Money report) — no partner route
 * writes `PartnerPayment`.
 */

type Params = Promise<{ id: string }>;

const bodySchema = z.object({
  kind: z.enum(["DOWN_PAYMENT", "INSTALLMENT"]),
  amountPiastres: z.number().int().positive(),
  paidAt: z.string().datetime().or(z.string().min(1)),
  stockReceiptId: z.string().min(1).optional().nullable(),
  dueAt: z.string().min(1).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    const admin = await requireAdmin();
    void admin;
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");

  const payments = await prisma.partnerPayment.findMany({
    where: { partnerId: id },
    orderBy: { paidAt: "desc" },
    include: { stockReceipt: { select: { id: true, reference: true, createdAt: true } } },
  });
  return apiSuccess({ payments });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  let adminUserId: string;
  try {
    const admin = await requireAdmin();
    adminUserId = admin.userId;
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiBadRequest(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
  }
  const data = parsed.data;

  if (data.stockReceiptId) {
    const receipt = await prisma.stockReceipt.findUnique({ where: { id: data.stockReceiptId }, select: { partnerId: true } });
    if (!receipt || receipt.partnerId !== id) {
      return apiBadRequest("إيصال الاستلام غير موجود لهذا الشريك");
    }
  }

  const payment = await prisma.partnerPayment.create({
    data: {
      partnerId: id,
      kind: data.kind,
      amountPiastres: data.amountPiastres,
      paidAt: new Date(data.paidAt),
      stockReceiptId: data.stockReceiptId || null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      reference: data.reference?.trim() || null,
      notes: data.notes?.trim() || null,
      recordedByUserId: adminUserId,
    },
  });
  return apiSuccess(payment, "تم تسجيل الدفعة", 201);
}
