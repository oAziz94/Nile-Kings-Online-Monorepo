import { redirect } from "next/navigation";

/**
 * `/admin/rerouting-rules/new` → `/admin/partners?tab=routing` (backlog 9.5c, rule B4): the
 * التوجيه tab has no separate "new rule" flow — every governorate is always shown, and
 * a rule row is created on first use (mode toggle or "+ إضافة") through the same tab.
 */
export default function AdminReroutingRuleNewRedirectPage() {
  redirect("/admin/partners?tab=routing");
}
