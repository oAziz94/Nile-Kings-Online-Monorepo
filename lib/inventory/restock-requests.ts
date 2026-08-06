import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  aggregateStockLines,
  InsufficientPartnerStockError,
  type PrismaTx,
} from "@/lib/inventory/partner-inventory";
import type { StockLine } from "@/lib/services/stock";

async function writeTransferLedger(
  tx: PrismaTx,
  input: {
    partnerId: string;
    variantId: string;
    availableDelta: number;
    restockRequestId: string;
    reason: "TRANSFER_IN" | "TRANSFER_OUT" | "RESTOCK_REQUEST_CREATE" | "RESTOCK_REQUEST_FULFILL";
    notes?: string | null;
  }
) {
  await tx.inventoryLedger.create({
    data: {
      partnerId: input.partnerId,
      variantId: input.variantId,
      reason: input.reason,
      quantityAvailableDelta: input.availableDelta,
      restockRequestId: input.restockRequestId,
      notes: input.notes ?? null,
    },
  });
}

export async function createRestockRequest(input: {
  distributorPartnerId: string;
  sourceAgentPartnerId?: string | null;
  lines: StockLine[];
  notes?: string | null;
}) {
  const destination = await prisma.partner.findUnique({
    where: { id: input.distributorPartnerId },
    select: { id: true, partnerType: true, linkedAgentId: true },
  });
  if (!destination || destination.partnerType !== "DISTRIBUTOR") {
    throw new Error("Destination partner must be a distributor");
  }

  const sourcePartnerId = input.sourceAgentPartnerId ?? destination.linkedAgentId;
  if (!sourcePartnerId) throw new Error("Distributor has no linked source agent");

  const source = await prisma.partner.findUnique({
    where: { id: sourcePartnerId },
    select: { id: true, partnerType: true },
  });
  if (!source || source.partnerType !== "AGENT") {
    throw new Error("Source partner must be an agent");
  }

  const lines = aggregateStockLines(input.lines);
  if (lines.length === 0) throw new Error("Restock request requires at least one line");

  return prisma.$transaction(async (tx) => {
    const request = await tx.restockRequest.create({
      data: {
        sourcePartnerId,
        destinationPartnerId: destination.id,
        notes: input.notes ?? null,
        items: {
          create: lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
          })),
        },
      },
      include: { items: true },
    });

    for (const line of lines) {
      await writeTransferLedger(tx, {
        partnerId: destination.id,
        variantId: line.variantId,
        availableDelta: 0,
        restockRequestId: request.id,
        reason: "RESTOCK_REQUEST_CREATE",
      });
    }

    return request;
  });
}

export async function approveRestockRequest(input: {
  restockRequestId: string;
  responseNotes?: string | null;
}) {
  return prisma.restockRequest.update({
    where: { id: input.restockRequestId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      responseNotes: input.responseNotes ?? undefined,
    },
    include: { items: true, sourcePartner: true, destinationPartner: true },
  });
}

export async function rejectRestockRequest(input: {
  restockRequestId: string;
  responseNotes?: string | null;
}) {
  return prisma.restockRequest.update({
    where: { id: input.restockRequestId },
    data: {
      status: "REJECTED",
      rejectedAt: new Date(),
      responseNotes: input.responseNotes ?? undefined,
    },
    include: { items: true, sourcePartner: true, destinationPartner: true },
  });
}

export async function fulfillRestockRequest(input: {
  restockRequestId: string;
  responseNotes?: string | null;
}) {
  return prisma.$transaction(
    async (tx) => {
      const request = await tx.restockRequest.findUnique({
        where: { id: input.restockRequestId },
        include: { items: true },
      });
      if (!request) throw new Error("Restock request not found");
      if (!["PENDING", "APPROVED"].includes(request.status)) {
        throw new Error(`Cannot fulfill restock request in status ${request.status}`);
      }

      const lines = aggregateStockLines(
        request.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))
      );
      const variantIds = lines.map((line) => line.variantId);

      await tx.$executeRaw(
        Prisma.sql`
          SELECT id, "partnerId", "variantId", "stockAvailable", "stockReserved"
          FROM "PartnerInventory"
          WHERE "partnerId" IN (${Prisma.join([request.sourcePartnerId, request.destinationPartnerId])})
            AND "variantId" IN (${Prisma.join(variantIds)})
          FOR UPDATE
        `
      );

      const sourceRows = await tx.partnerInventory.findMany({
        where: { partnerId: request.sourcePartnerId, variantId: { in: variantIds } },
        select: { id: true, variantId: true, stockAvailable: true, stockReserved: true },
      });
      const byVariant = new Map(sourceRows.map((row) => [row.variantId, row]));

      for (const line of lines) {
        const source = byVariant.get(line.variantId);
        const sellable = source ? source.stockAvailable - source.stockReserved : 0;
        if (!source || sellable < line.quantity) {
          throw new InsufficientPartnerStockError(
            request.sourcePartnerId,
            line.variantId,
            line.quantity,
            Math.max(0, sellable)
          );
        }

        await tx.partnerInventory.update({
          where: { id: source.id },
          data: { stockAvailable: { decrement: line.quantity } },
        });
        await tx.partnerInventory.upsert({
          where: {
            partnerId_variantId: {
              partnerId: request.destinationPartnerId,
              variantId: line.variantId,
            },
          },
          update: { stockAvailable: { increment: line.quantity } },
          create: {
            partnerId: request.destinationPartnerId,
            variantId: line.variantId,
            stockAvailable: line.quantity,
            stockReserved: 0,
          },
        });

        await writeTransferLedger(tx, {
          partnerId: request.sourcePartnerId,
          variantId: line.variantId,
          availableDelta: -line.quantity,
          restockRequestId: request.id,
          reason: "TRANSFER_OUT",
        });
        await writeTransferLedger(tx, {
          partnerId: request.destinationPartnerId,
          variantId: line.variantId,
          availableDelta: line.quantity,
          restockRequestId: request.id,
          reason: "TRANSFER_IN",
        });
        await writeTransferLedger(tx, {
          partnerId: request.destinationPartnerId,
          variantId: line.variantId,
          availableDelta: line.quantity,
          restockRequestId: request.id,
          reason: "RESTOCK_REQUEST_FULFILL",
        });
      }

      return tx.restockRequest.update({
        where: { id: request.id },
        data: {
          status: "FULFILLED",
          fulfilledAt: new Date(),
          responseNotes: input.responseNotes ?? undefined,
        },
        include: { items: true, sourcePartner: true, destinationPartner: true },
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
}

