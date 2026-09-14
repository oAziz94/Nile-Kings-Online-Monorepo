import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

/**
 * `/admin/routed-orders/[id]` → `/admin/orders/<orderId>` (backlog 9.3 e, rule B4): `id`
 * here is the `RoutedOrder` id, not the order id — look up its `orderId` and redirect there.
 * A `RoutedOrder` that no longer exists renders the app's own 404 rather than a broken page.
 */
export default async function RoutedOrderDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const routed = await prisma.routedOrder.findUnique({ where: { id }, select: { orderId: true } });
  if (!routed) notFound();
  redirect(`/admin/orders/${routed.orderId}`);
}
