import { redirect } from "next/navigation";
import { forwardQueryString } from "@/lib/partner/forward-query-string";

/** Old v1 route (backlog 4.23) — see `../page.tsx`'s doc comment. */
export default async function ReceiptsNewRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/partner/stock/intake/new${forwardQueryString(await searchParams)}`);
}
