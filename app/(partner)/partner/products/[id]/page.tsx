import { redirect } from "next/navigation";

/**
 * Old v1 route (backlog 4.18) — the per-product variant editor moves to
 * `/partner/stock/products/[id]` (backlog 5.4, `05-partner-portal-v2.md` §2: "المخزون
 * hub"). Kept as a permanent redirect per rule (17).
 */
export default async function ProductDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/partner/stock/products/${id}`);
}
