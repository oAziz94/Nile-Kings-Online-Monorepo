import { NextRequest } from "next/server";
import { StockReceiptKind } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import {
  ApplyReceiptError,
  APPLY_RECEIPT_TRANSACTION_TIMEOUT_MS,
  applyStockReceipt,
  mergeReceiptLines,
  parseReceiptLines,
} from "@/lib/inventory/apply-receipt";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

/**
 * `POST /api/admin/partners/[id]/receipts` (backlog 9.4a (b) / `06-admin-v2.md` §8 control
 * matrix change (b)) — the admin issues a `StockReceipt` on the partner's behalf at
 * hand-over, calling the same `applyStockReceipt` transaction the partner route uses, with
 * `recordedBy: "ADMIN"` and the caller's id, then writes an `AdminAuditLog` row.
 * `GET` lists a partner's receipts for the الحساب المالي tab (any `kind`, unlike the
 * partner's own paginated tabs — the finance tab shows every receipt on one table).
 */

type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

  const [receipts, total] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: { partnerId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { lines: { include: { variant: { select: { pricePiastres: true } } } } },
    }),
    prisma.stockReceipt.count({ where: { partnerId: id } }),
  ]);

  const rows = receipts.map((r) => {
    const units = r.lines.reduce((s, l) => s + Math.abs(l.quantity), 0);
    const rateLine = r.lines.find((l) => l.unitCostPiastres !== null && l.variant.pricePiastres > 0);
    const rateBps = rateLine
      ? Math.round(((rateLine.unitCostPiastres as number) / rateLine.variant.pricePiastres) * 10_000)
      : null;
    return {
      id: r.id,
      kind: r.kind,
      reference: r.reference,
      notes: r.notes,
      createdAt: r.createdAt,
      units,
      totalCostPiastres: r.totalCostPiastres,
      recordedBy: r.recordedBy,
      rateBps,
    };
  });

  return apiSuccess({ receipts: rows, total, limit, offset });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");

  let body: { kind?: unknown; reference?: unknown; notes?: unknown; lines?: unknown };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const kind = body.kind === "FACTORY" || body.kind === "COUNT" ? (body.kind as StockReceiptKind) : null;
  if (!kind) return apiBadRequest("kind يجب أن يكون FACTORY أو COUNT");

  const reference =
    typeof body.reference === "string" && body.reference.trim() ? body.reference.trim().slice(0, 200) : null;
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 2000) : null;

  const parsedLines = parseReceiptLines(body.lines);
  if (!parsedLines) return apiBadRequest("يجب إدخال بند واحد على الأقل ببيانات صحيحة");

  const lines = mergeReceiptLines(parsedLines, kind);

  try {
    const receipt = await prisma.$transaction(
      (tx) =>
        applyStockReceipt(tx, {
          partnerId: id,
          kind,
          lines,
          reference,
          notes,
          recordedBy: "ADMIN",
          recordedByUserId: actor.userId,
        }),
      { timeout: APPLY_RECEIPT_TRANSACTION_TIMEOUT_MS }
    );
    await logAdminAction(prisma, {
      actor,
      action: "create",
      entityType: "receipt",
      entityId: receipt.id,
      entityLabel: receipt.reference ?? receipt.id,
      after: {
        partnerId: id,
        partnerName: partner.name,
        kind: receipt.kind,
        totalCostPiastres: receipt.totalCostPiastres,
        lineCount: receipt.lines.length,
      },
      ip: requestIp(req),
    });
    return apiSuccess(receipt, "تم تسجيل الإيصال", 201);
  } catch (error) {
    if (error instanceof ApplyReceiptError) {
      return apiBadRequest(error.publicMessage);
    }
    throw error;
  }
}
