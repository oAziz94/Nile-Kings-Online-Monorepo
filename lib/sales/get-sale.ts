import { prisma } from "@/lib/db";

/** A sale plus the outlet's receipt header, for the receipt view. Own outlet only (null otherwise). */
export async function getStoreSaleForPartner(partnerId: string, saleId: string) {
  return prisma.storeSale.findFirst({
    where: { id: saleId, partnerId },
    include: {
      items: { orderBy: { id: "asc" } },
      partner: { select: { name: true, phone: true, storeName: true, storeAddress: true, receiptFooter: true } },
    },
  });
}

export type StoreSaleDetail = NonNullable<Awaited<ReturnType<typeof getStoreSaleForPartner>>>;
