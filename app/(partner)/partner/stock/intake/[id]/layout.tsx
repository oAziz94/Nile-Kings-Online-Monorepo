import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// `partner/stock/intake/[id]/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Reads only the display identifier (same `إيصال #<8>` format the
// page itself renders), falling back to the plural label if the receipt no longer exists.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const receipt = await prisma.stockReceipt.findUnique({ where: { id }, select: { id: true } });
  return { title: receipt ? `إيصال #${receipt.id.slice(-8).toUpperCase()}` : "الاستلام من المصنع" };
}

export default function PartnerStockIntakeDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
