import { redirect } from "next/navigation";
import { PartnerInventoryPicker } from "@/components/admin/partner-inventory-picker";

/**
 * `/admin/partner-inventory` (backlog 9.4a (g), B4) — the per-partner grid this page used to
 * render inline has moved to the partner profile's المخزون tab
 * (`components/admin/partner-stock-tab.tsx`). This page stays reachable (the list's "مخزون
 * الشبكة" link still points here until 9.5 builds the real network-stock tab) but now only
 * picks a partner and redirects to their profile: `?partnerId=<id>` → `/admin/partners/<id>?tab=stock`.
 */
export default async function AdminPartnerInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const partnerIdRaw = params.partnerId;
  const partnerId = Array.isArray(partnerIdRaw) ? partnerIdRaw[0] : partnerIdRaw;
  if (partnerId) {
    redirect(`/admin/partners/${partnerId}?tab=stock`);
  }
  return <PartnerInventoryPicker />;
}
