import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/**
 * Old v1 route (backlog 4.18) — superseded by `/partner/stock` (backlog 5.1,
 * `05-partner-portal-v2.md` §2). Kept as a permanent redirect per rule (17); the query
 * string (`?lowStock=1`, search/page state) is forwarded.
 */
export default async function ProductsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/stock${forwardQueryString(await searchParams)}`);
}
