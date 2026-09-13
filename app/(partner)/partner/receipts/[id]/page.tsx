import { redirect } from "next/navigation";

/** Old v1 route (backlog 4.23) — see `../page.tsx`'s doc comment. */
export default async function ReceiptDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/partner/stock/intake/${id}`);
}
