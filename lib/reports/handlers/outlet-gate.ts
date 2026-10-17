import { prisma } from "@/lib/db";
import { apiForbidden } from "@/lib/api/response";

/**
 * Backlog 11.5 (d): the fulfilment and money reports are online-channel concepts. A partner's
 * own call as an outlet (DISTRIBUTOR) answers 403, like `reports/network` always has. Returns
 * the 403 response, or `null` when the partner may proceed.
 */
export async function forbidOutlet(partnerId: string): Promise<Response | null> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { partnerType: true } });
  return partner?.partnerType === "DISTRIBUTOR" ? apiForbidden("هذا التقرير غير متاح للمنافذ") : null;
}
