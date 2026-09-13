import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/**
 * Old v1 route (backlog 4.23) — receipts is the "الاستلام من المصنع" tab under
 * `/partner/stock` (backlog 5.4, `05-partner-portal-v2.md` §2). Kept as a permanent
 * redirect per rule (17); the query string (pagination state) is forwarded.
 */
export default async function ReceiptsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/stock/intake${forwardQueryString(await searchParams)}`);
}
