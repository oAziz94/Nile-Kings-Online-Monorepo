import { redirect } from "next/navigation";

/**
 * `/admin/partner-inventory` → `/admin/partners?tab=network` (backlog 9.5c, rule B4): the
 * picker this page used to render is superseded by مخزون الشبكة (`NetworkStockTab`), which
 * shows every partner's stock in one grid instead of asking which partner to view first.
 * `?partnerId=<id>` keeps redirecting to that partner's profile stock tab (unchanged,
 * `PartnerStockTab` still lives there and is not part of this task).
 */
export default async function AdminPartnerInventoryRedirectPage({
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
  redirect("/admin/partners?tab=network");
}
