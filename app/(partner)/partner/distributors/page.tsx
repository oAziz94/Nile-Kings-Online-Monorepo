import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/**
 * Old v1 route (backlog 4.21) — superseded by `/partner/network` (backlog 5.1,
 * `05-partner-portal-v2.md` §2). Kept as a permanent redirect per rule (17).
 */
export default async function DistributorsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/network${forwardQueryString(await searchParams)}`);
}
