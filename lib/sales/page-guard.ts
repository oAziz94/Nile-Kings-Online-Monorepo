import { redirect } from "next/navigation";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/** Server-side gate for the outlet-only sales pages: an AGENT is sent back to the portal home. */
export async function requireOutletPage() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({ where: { id: user.partnerId }, select: { partnerType: true } });
  if (partner?.partnerType !== "DISTRIBUTOR") redirect("/partner");
  return user;
}
