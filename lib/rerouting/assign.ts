/**
 * Governorate-based order assignment: round-robin among rule partners, create RoutedOrder, send WhatsApp.
 * Safe to call after order creation; failures do not affect the order.
 */

import { prisma } from "@/lib/db";
import { getWhatsAppService } from "@/lib/services/whatsapp";
import { buildOrderAssignmentMessage } from "./message";

export type AssignResult =
  | { assigned: true; routedOrderId: string; partnerId: string; notified: boolean }
  | { assigned: false; routedOrderId: string; reason: "no_rule" | "no_partners" };

/**
 * Assign an order to a partner by governorate (round-robin), create RoutedOrder, and send WhatsApp.
 * Call after order is successfully created. Runs assignment in a transaction; WhatsApp is sent after.
 * If no rule or no active partners, creates RoutedOrder with status UNROUTED.
 */
export async function assignOrderToGovernorate(orderId: string): Promise<AssignResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, phone: true } },
      items: { select: { productName: true, variantName: true, quantity: true } },
    },
  });

  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const addr = order.shippingAddress as { governorate?: string } | null;
  const governorate = (addr?.governorate ?? "").toString().trim();
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
  const currentIndex = lastId ? partnerIds.indexOf(lastId) : -1;
  const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % partnerIds.length;
  const selectedPartnerId = partnerIds[nextIndex]!;
  const sequence = (rule.partners.length ?? 0) > 0 ? nextIndex + 1 : 0;

  const { routedOrderId, partnerId, alreadyExisted } = await prisma.$transaction(async (tx) => {
    const existing = await tx.routedOrder.findUnique({ where: { orderId } });
    if (existing) {
      return { routedOrderId: existing.id, partnerId: existing.partnerId ?? "", alreadyExisted: true };
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
    return { routedOrderId: routed.id, partnerId: selectedPartnerId, alreadyExisted: false };
  });

  if (alreadyExisted) {
    const ro = await prisma.routedOrder.findUnique({
      where: { id: routedOrderId },
      select: { notifiedAt: true },
    });
    return {
      assigned: true,
      routedOrderId,
      partnerId,
      notified: !!ro?.notifiedAt,
    };
  }

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { phone: true },
  });

  let notified = false;
  if (partner?.phone) {
    const message = buildOrderAssignmentMessage({
      id: order.id,
      createdAt: order.createdAt,
      paymentMethod: order.paymentMethod,
      shippingPiastres: order.shippingPiastres,
      totalPiastres: order.totalPiastres,
      shippingAddress: order.shippingAddress,
      user: order.user,
      items: order.items,
    });
    const whatsapp = getWhatsAppService();
    const templateName = process.env.WHATSAPP_ORDER_TEMPLATE_NAME?.trim();
    const templateLang = process.env.WHATSAPP_ORDER_TEMPLATE_LANGUAGE?.trim() || "ar";
    const result = templateName
      ? await whatsapp.sendTemplate(partner.phone, templateName, templateLang, [message])
      : await whatsapp.sendOrderAssignment(partner.phone, message);
    if (result.ok) {
      notified = true;
      await prisma.routedOrder.update({
        where: { id: routedOrderId },
        data: { status: "NOTIFIED", notifiedAt: new Date(), notificationError: null },
      });
    } else {
      console.error("[rerouting] WhatsApp send failed for order", orderId, result.error);
      await prisma.routedOrder.update({
        where: { id: routedOrderId },
        data: { notificationError: result.error },
      });
    }
  }

  return {
    assigned: true,
    routedOrderId,
    partnerId,
    notified,
  };
}
