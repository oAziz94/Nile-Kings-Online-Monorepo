import { redirect } from "next/navigation";

/**
 * `/admin/rerouting-rules` → `/admin/partners?tab=routing` (backlog 9.5c, rule B4): the
 * governorate list this page rendered is now the التوجيه tab (`RoutingTab`), which shows
 * every governorate (not just the ones with a rule row) plus 30-day shares and the mode
 * pill the old list did not have.
 */
export default function AdminReroutingRulesRedirectPage() {
  redirect("/admin/partners?tab=routing");
}
