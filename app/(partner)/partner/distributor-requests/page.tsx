import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/**
 * Old v1 route (backlog 4.20, agent side) — distributor requests is the "طلبات التوريد"
 * tab under `/partner/stock` (backlog 5.4, §2). Kept as a permanent redirect per rule (17).
 */
export default async function DistributorRequestsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/stock/requests${forwardQueryString(await searchParams)}`);
}
