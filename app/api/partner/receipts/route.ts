import { NextRequest } from "next/server";
import { Prisma, StockReceiptKind } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import {
  ApplyReceiptError,
  APPLY_RECEIPT_TRANSACTION_TIMEOUT_MS,
  applyStockReceipt,
  mergeReceiptLines,
  parseReceiptLines,
} from "@/lib/inventory/apply-receipt";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

/**
 * `StockReceipt` create/list — backlog 4.23. AGENT only (the factory ships to agents;
 * distributors receive via restock requests, unchanged). The transaction itself (line
 * validation, cost snapshot, ledger entries, `totalCostPiastres`) lives in
 * `lib/inventory/apply-receipt.ts` (backlog 9.4a (b), B3) — this route only authenticates,
 * parses the request body and calls it with `recordedBy: "PARTNER"`. The admin's equivalent
 * (`POST /api/admin/partners/[id]/receipts`) calls the same function with `recordedBy: "ADMIN"`.
 */

async function requireAgentPartner() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { partnerType: true },
  });
  if (partner?.partnerType !== "AGENT") {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    (err as Error & { forbiddenMessage?: string }).forbiddenMessage = "هذه الصفحة متاحة للوكلاء فقط";
    throw err;
  }
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAgentPartner();

    let body: { kind?: unknown; reference?: unknown; notes?: unknown; lines?: unknown };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const kind = body.kind === "FACTORY" || body.kind === "COUNT" ? body.kind : null;
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
            partnerId: user.partnerId,
            kind,
            lines,
            reference,
            notes,
            recordedBy: "PARTNER",
            recordedByUserId: user.userId,
          }),
        { timeout: APPLY_RECEIPT_TRANSACTION_TIMEOUT_MS }
      );
      // Backlog 9.7 (e) — mirror the partner's own money/stock write into `AdminAuditLog`
      // with `actorRole: "PARTNER"` (the partner's own `SessionUser`, unchanged behaviour —
      // only the log gains a row). The admin equivalent already logs from its own route.
      await logAdminAction(prisma, {
        actor: user,
        action: "create",
        entityType: "receipt",
        entityId: receipt.id,
        entityLabel: receipt.reference ?? receipt.id,
        after: {
          partnerId: user.partnerId,
          kind: receipt.kind,
          totalCostPiastres: receipt.totalCostPiastres,
          lineCount: receipt.lines.length,
        },
        ip: requestIp(req),
      });
      return apiSuccess(receipt, undefined, 201);
    } catch (error) {
      if (error instanceof ApplyReceiptError) {
        return apiBadRequest(error.publicMessage);
      }
      throw error;
    }
  } catch (error: unknown) {
    const err = error as { status?: number; forbiddenMessage?: string };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden(err.forbiddenMessage ?? "غير مصرح");
    throw error;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAgentPartner();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
    // Backlog 5.4 (allowed additive API change): the stock hub splits "الاستلام من المصنع"
    // (FACTORY) and "الجرد" (COUNT) into two tabs backed by the same list endpoint.
    const kindParam = searchParams.get("kind");
    const kind: StockReceiptKind | null =
      kindParam === "FACTORY" || kindParam === "COUNT" ? (kindParam as StockReceiptKind) : null;

    const where: Prisma.StockReceiptWhereInput = { partnerId: user.partnerId, ...(kind ? { kind } : {}) };
    const [receipts, total] = await Promise.all([
      prisma.stockReceipt.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: { lines: { select: { id: true, quantity: true } } },
      }),
      prisma.stockReceipt.count({ where }),
    ]);

    const rows = receipts.map((r) => ({
      id: r.id,
      kind: r.kind,
      reference: r.reference,
      notes: r.notes,
      createdAt: r.createdAt,
      lineCount: r.lines.length,
      totalUnits: r.lines.reduce((sum, l) => sum + Math.abs(l.quantity), 0),
      totalCostPiastres: r.totalCostPiastres,
      // Backlog 9.4a (b) — additive: who entered this receipt.
      recordedBy: r.recordedBy,
    }));

    return apiSuccess({ receipts: rows, total, limit, offset });
  } catch (error: unknown) {
    const err = error as { status?: number; forbiddenMessage?: string };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden(err.forbiddenMessage ?? "غير مصرح");
    throw error;
  }
}
