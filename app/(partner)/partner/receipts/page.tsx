import { redirect } from "next/navigation";

/**
 * Old v1 route (backlog 4.23) — receipts becomes a tab under `/partner/stock`
 * (backlog 5.1, `05-partner-portal-v2.md` §2: "المخزون hub"). The tab itself lands in
 * 5.4; until then this redirects to the stock hub's index per rule (17)/task text
 * ("the redirect target must exist and render").
 */
export default function ReceiptsRedirect() {
  redirect("/partner/stock");
}
