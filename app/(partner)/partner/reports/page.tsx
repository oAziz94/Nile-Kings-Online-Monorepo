import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/**
 * Old v1 route (backlog 4.22) — superseded by `/partner/reports/sales` (backlog 5.1,
 * `05-partner-portal-v2.md` §2: reports split into `/partner/reports/{sales,fulfilment,
 * inventory,network,money}`, sales is the representative/default report for now). Kept
 * as a permanent redirect per rule (17); the query string (period params) is forwarded.
 */
export default async function ReportsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/reports/sales${forwardQueryString(await searchParams)}`);
}
