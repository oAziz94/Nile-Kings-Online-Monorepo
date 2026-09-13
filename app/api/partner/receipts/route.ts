import { NextRequest } from "next/server";
import { Prisma, StockReceiptKind } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { computeUnitCostPiastres } from "@/lib/inventory/receipts";

/**
 * `StockReceipt` create/list — backlog 4.23. AGENT only (the factory ships to agents;
 * distributors receive via restock requests, unchanged). Every applied line is a
 * read-lock-write under `SELECT … FOR UPDATE`, exactly `app/api/partner/inventory/route.ts`'s
 * PATCH pattern per `04-decisions.md`'s 2026-09-12 "every stock read-modify-write must hold a
 * row lock" rule — the whole receipt (`StockReceipt` + every line's `PartnerInventory`
 * mutation + every `InventoryLedger` row) is one `$transaction`; any single line's rejection
 * (below-reserved on a COUNT, or an unknown variant) throws so the entire receipt rolls back.
 *
 * Duplicate `variantId`s within one `lines` array are MERGED, not rejected (decision, see
 * `lib/inventory/receipts.ts`'s `mergeRawRows` doc comment for the same call on the
 * preview path): FACTORY quantities are summed (a receipt is naturally additive — two lines
 * for the same SKU on one delivery note is just one bigger delivery); COUNT quantities use the
 * LAST occurrence (a physical count is a single fact, and summing two counts of the same
 * variant would double it).
 */

const RESERVED_FLOOR_MESSAGE = (reserved: number) =>
  `لا يمكن أن يكون المخزون أقل من المحجوز (${reserved})`;

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

type InputLine = { variantId?: unknown; quantity?: unknown };

function parseLines(input: unknown): { variantId: string; quantity: number }[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: { variantId: string; quantity: number }[] = [];
  for (const raw of input as InputLine[]) {
    if (!raw || typeof raw !== "object") return null;
    const variantId = typeof raw.variantId === "string" ? raw.variantId.trim() : "";
    if (!variantId) return null;
    if (typeof raw.quantity !== "number" || !Number.isInteger(raw.quantity)) return null;
    out.push({ variantId, quantity: raw.quantity });
  }
  return out;
}

function mergeLines(
  lines: { variantId: string; quantity: number }[],
  kind: "FACTORY" | "COUNT"
): { variantId: string; quantity: number }[] {
  const merged = new Map<string, number>();
  for (const line of lines) {
    if (kind === "FACTORY") {
      merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
    } else {
      merged.set(line.variantId, line.quantity); // COUNT: last occurrence wins
    }
  }
  return Array.from(merged.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
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

    const parsedLines = parseLines(body.lines);
    if (!parsedLines) return apiBadRequest("يجب إدخال بند واحد على الأقل ببيانات صحيحة");

    if (kind === "FACTORY" && parsedLines.some((l) => l.quantity <= 0)) {
      return apiBadRequest("كمية الاستلام يجب أن تكون رقماً صحيحاً موجباً");
    }
    if (kind === "COUNT" && parsedLines.some((l) => l.quantity < 0)) {
      return apiBadRequest("الجرد الفعلي يجب أن يكون رقماً صحيحاً غير سالب");
    }

    const lines = mergeLines(parsedLines, kind);

    class ReceiptError extends Error {
      constructor(public readonly publicMessage: string) {
        super(publicMessage);
      }
    }

    try {
      const receipt = await prisma.$transaction(async (tx) => {
        const variants = await tx.variant.findMany({
          where: { id: { in: lines.map((l) => l.variantId) } },
          select: { id: true, pricePiastres: true },
        });
        const priceByVariantId = new Map(variants.map((v) => [v.id, v.pricePiastres]));
        for (const line of lines) {
          if (!priceByVariantId.has(line.variantId)) throw new ReceiptError("المتغير غير موجود");
        }

        // Settlement cost snapshot (backlog 5.1) — FACTORY lines only; a COUNT receipt
        // never creates a cost (05-partner-portal-v2.md §4.1: "a count is a correction,
        // not a purchase"). Snapshotted from the partner's rate *at apply time* so a later
        // rate change never rewrites this receipt's history.
        let costRateBps: number | null = null;
        if (kind === "FACTORY") {
          const partnerRow = await tx.partner.findUniqueOrThrow({
            where: { id: user.partnerId },
            select: { costRateBps: true },
          });
          costRateBps = partnerRow.costRateBps;
        }
        let totalCostPiastres = 0;

        const created = await tx.stockReceipt.create({
          data: { partnerId: user.partnerId, kind, reference, notes },
        });

        for (const line of lines) {
          await tx.partnerInventory.upsert({
            where: { partnerId_variantId: { partnerId: user.partnerId, variantId: line.variantId } },
            update: {},
            create: { partnerId: user.partnerId, variantId: line.variantId, stockAvailable: 0, stockReserved: 0 },
          });
          const [locked] = await tx.$queryRaw<{ stockAvailable: number; stockReserved: number }[]>`
            SELECT "stockAvailable", "stockReserved"
            FROM "PartnerInventory"
            WHERE "partnerId" = ${user.partnerId} AND "variantId" = ${line.variantId}
            FOR UPDATE
          `;
          const previousAvailable = locked.stockAvailable;
          const stockReserved = locked.stockReserved;

          let newAvailable: number;
          let availableDelta: number;
          if (kind === "FACTORY") {
            newAvailable = previousAvailable + line.quantity;
            availableDelta = line.quantity;
          } else {
            newAvailable = line.quantity;
            if (newAvailable < stockReserved) {
              throw new ReceiptError(RESERVED_FLOOR_MESSAGE(stockReserved));
            }
            availableDelta = newAvailable - previousAvailable;
          }

          await tx.partnerInventory.update({
            where: { partnerId_variantId: { partnerId: user.partnerId, variantId: line.variantId } },
            data: { stockAvailable: newAvailable },
          });

          let unitCostPiastres: number | null = null;
          if (kind === "FACTORY" && costRateBps !== null) {
            const pricePiastres = priceByVariantId.get(line.variantId) ?? 0;
            unitCostPiastres = computeUnitCostPiastres(pricePiastres, costRateBps);
            totalCostPiastres += unitCostPiastres * line.quantity;
          }

          await tx.stockReceiptLine.create({
            data: {
              receiptId: created.id,
              variantId: line.variantId,
              quantity: line.quantity,
              previousAvailable,
              newAvailable,
              unitCostPiastres,
            },
          });

          await tx.inventoryLedger.create({
            data: {
              partnerId: user.partnerId,
              variantId: line.variantId,
              reason: kind === "FACTORY" ? "FACTORY_RECEIPT" : "STOCK_COUNT",
              quantityAvailableDelta: availableDelta,
              quantityReservedDelta: 0,
              stockReceiptId: created.id,
              notes: kind === "FACTORY" ? "Factory receipt" : "Stock count",
            },
          });
        }

        if (kind === "FACTORY") {
          await tx.stockReceipt.update({
            where: { id: created.id },
            data: { totalCostPiastres },
          });
        }

        return tx.stockReceipt.findUniqueOrThrow({
          where: { id: created.id },
          include: { lines: { include: { variant: { select: { sku: true, name: true } } } } },
        });
      }, { timeout: 15_000 });
      // ^ Backlog 5.4 finding: Prisma's default interactive-transaction timeout is 5000ms.
      // Several concurrent receipts touching the same variant serialise on that row's
      // `SELECT … FOR UPDATE` (the intended, correct behaviour — see the file-header note),
      // so under real contention a transaction can legitimately queue behind others long
      // enough to exceed the default and abort with a false "transaction already closed"
      // error even though every line is valid. 15s comfortably covers a handful of queued
      // receipts against the remote Neon branch without changing any other behaviour.

      return apiSuccess(receipt, undefined, 201);
    } catch (error) {
      if (error instanceof ReceiptError) {
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
    }));

    return apiSuccess({ receipts: rows, total, limit, offset });
  } catch (error: unknown) {
    const err = error as { status?: number; forbiddenMessage?: string };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden(err.forbiddenMessage ?? "غير مصرح");
    throw error;
  }
}
