/**
 * Governorate-based order assignment: round-robin among rule partners, create RoutedOrder.
 * Safe to call after order creation; failures do not affect the order.
 */

import { prisma } from "@/lib/db";

export type AssignResult =
  | { assigned: true; routedOrderId: string; partnerId: string }
  | { assigned: false; routedOrderId: string; reason: "no_rule" | "no_partners" };

/**
 * Assign an order to a partner by governorate (round-robin) and create RoutedOrder.
 * Call after order is successfully created. Runs assignment in a transaction.
 * If no rule or no active partners, creates RoutedOrder with status UNROUTED.
 */
export async function assignOrderToGovernorate(orderId: string): Promise<AssignResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      assignedPartner: { select: { id: true } },
    },
  });

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const addr = order.shippingAddress as { governorate?: string } | null;
  const governorate = (addr?.governorate ?? "").toString().trim();

  // Authoritative: place-order already picked and locked in a fulfilling partner (the one
  // whose stock the customer saw while browsing/cart). Route to that partner directly instead
  // of re-deriving one from the delivery address's governorate rule, which may point at a
  // different partner (e.g. shipping to a relative in another governorate) and would silently
  // disagree with the partner that reserved/committed the stock for this order.
  if (order.assignedPartnerId && order.assignedPartner) {
    const selectedPartnerId = order.assignedPartnerId;

    const { routedOrderId, partnerId } = await prisma.$transaction(async (tx) => {
      const existing = await tx.routedOrder.findUnique({ where: { orderId } });
      if (existing) {
        return { routedOrderId: existing.id, partnerId: existing.partnerId ?? "" };
      }
      const routed = await tx.routedOrder.create({
        data: {
          orderId,
          governorate: governorate || "—",
          partnerId: selectedPartnerId,
          assignmentMode: "AUTO",
          status: "ASSIGNED",
        },
      });
      return { routedOrderId: routed.id, partnerId: selectedPartnerId };
    });

    return { assigned: true, routedOrderId, partnerId };
  }

  if (!governorate) {
    const unrouted = await prisma.routedOrder.create({
      data: {
        orderId,
        governorate: "—",
        status: "UNROUTED",
        assignmentMode: "AUTO",
      },
    });
    return { assigned: false, routedOrderId: unrouted.id, reason: "no_rule" };
  }

  const rule = await prisma.reroutingRule.findFirst({
    where: { governorate, isActive: true },
    include: {
      partners: {
        where: { isActive: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: true },
      },
    },
  });

  if (!rule || rule.partners.length === 0) {
    const unrouted = await prisma.routedOrder.create({
      data: {
        orderId,
        governorate,
        status: "UNROUTED",
        assignmentMode: "AUTO",
      },
    });
    return { assigned: false, routedOrderId: unrouted.id, reason: rule ? "no_partners" : "no_rule" };
  }

  const partnerIds = rule.partners.map((p) => p.partnerId);
  const lastId = rule.lastAssignedPartnerId;
  const lastIndex = lastId ? partnerIds.indexOf(lastId) : -1;
  const selectedPartnerId = lastIndex >= 0 ? partnerIds[(lastIndex + 1) % partnerIds.length]! : partnerIds[0]!;
  const selectedIndex = partnerIds.indexOf(selectedPartnerId);
  const sequence = selectedIndex >= 0 ? selectedIndex + 1 : 0;

  const { routedOrderId, partnerId } = await prisma.$transaction(async (tx) => {
    const existing = await tx.routedOrder.findUnique({ where: { orderId } });
    if (existing) {
      return { routedOrderId: existing.id, partnerId: existing.partnerId ?? "" };
    }
    const routed = await tx.routedOrder.create({
      data: {
        orderId,
        governorate,
        ruleId: rule.id,
        partnerId: selectedPartnerId,
        assignmentSequence: sequence,
        assignmentMode: "AUTO",
        status: "ASSIGNED",
      },
    });
    await tx.reroutingRule.update({
      where: { id: rule.id },
      data: { lastAssignedPartnerId: selectedPartnerId },
    });
    return { routedOrderId: routed.id, partnerId: selectedPartnerId };
  });

  return { assigned: true, routedOrderId, partnerId };
}
