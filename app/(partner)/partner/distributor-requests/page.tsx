import { redirect } from "next/navigation";

/**
 * Old v1 route (backlog 4.20, agent side) — distributor requests becomes a tab under
 * `/partner/stock` (backlog 5.1, §2: "طلبات التوريد"). The tab lands in 5.4; redirects to
 * the stock hub's index until then, per rule (17).
 */
export default function DistributorRequestsRedirect() {
  redirect("/partner/stock");
}
