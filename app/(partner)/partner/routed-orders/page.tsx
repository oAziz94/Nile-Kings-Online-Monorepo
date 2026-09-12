import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/**
 * Old v1 route (backlog 4.19) — superseded by `/partner/orders` (backlog 5.1,
 * `05-partner-portal-v2.md` §2 information architecture). Kept as a permanent redirect
 * per rule (17): "old routes keep working as `redirect()`s until 5.6 removes the old
 * specs." The query string is forwarded (`?status=`, `?variantId=`, etc. are still real,
 * live filters on `/partner/orders`) so old deep links keep filtering, not just loading.
 */
export default async function RoutedOrdersRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/orders${forwardQueryString(await searchParams)}`);
}
