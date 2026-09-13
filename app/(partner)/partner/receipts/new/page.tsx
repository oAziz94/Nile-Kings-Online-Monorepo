import { redirect } from "next/navigation";

/** Old v1 route (backlog 4.23) — see `../page.tsx`'s doc comment. */
export default function ReceiptsNewRedirect() {
  redirect("/partner/stock");
}
