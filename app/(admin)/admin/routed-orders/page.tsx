import { redirect } from "next/navigation";

/**
 * `/admin/routed-orders` → `/admin/orders` (backlog 9.3 e, rule B4): the list is gone —
 * its two useful powers (reassign, proof of delivery) live inside the order detail now.
 * `?status=UNROUTED` (the old "show me the unrouted ones" filter) maps to the new list's
 * `?stage=UNASSIGNED` (بلا شريك) tab.
 */
export default async function RoutedOrdersRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = Array.isArray(params.status) ? params.status[0] : params.status;
  if (status === "UNROUTED") {
    redirect("/admin/orders?stage=UNASSIGNED");
  }
  redirect("/admin/orders");
}
