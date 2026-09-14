import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/**
 * `/admin/rerouting-rules/[id]` → `/admin/partners?tab=routing&q=<governorate>` (backlog
 * 9.5c, rule B4): looks the rule up for its governorate and redirects into the التوجيه tab
 * filtered to it, so an old bookmark/link still lands on the right row. A rule that no
 * longer exists (deleted since the link was made) falls back to the unfiltered tab.
 */
export default async function AdminReroutingRuleDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rule = await prisma.reroutingRule.findUnique({ where: { id }, select: { governorate: true } });
  if (rule) {
    redirect(`/admin/partners?tab=routing&q=${encodeURIComponent(rule.governorate)}`);
  }
  redirect("/admin/partners?tab=routing");
}
