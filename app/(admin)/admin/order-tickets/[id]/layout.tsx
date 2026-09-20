import type { Metadata } from "next";
import { prisma } from "@/lib/db";

// `admin/order-tickets/[id]/page.tsx` is a client component and cannot export metadata
// itself — backlog 10.30. Reads only the display identifier (same `طلب #<8>` format the page
// itself renders for its ticket-about-order title), falling back to the plural label.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const ticket = await prisma.orderTicket.findUnique({ where: { id }, select: { orderId: true } });
  return {
    title: ticket ? `سؤال عن الطلب #${ticket.orderId.slice(-8).toUpperCase()}` : "أسئلة العملاء",
  };
}

export default function AdminOrderTicketDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
