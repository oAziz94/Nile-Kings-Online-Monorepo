import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// `partner/orders/[id]/page.tsx` is a client component and cannot export metadata itself —
// backlog 10.30. Reads only the display identifier (same `طلب #<8>` format the page itself
// renders), falling back to the plural label if the order no longer exists.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  return { title: order ? `طلب #${order.id.slice(0, 8)}` : "الطلبات" };
}

export default function PartnerOrderDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
