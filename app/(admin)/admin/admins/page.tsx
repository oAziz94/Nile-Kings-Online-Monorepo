import { redirect } from "next/navigation";

/**
 * `/admin/admins` (backlog 8.3) — superseded by the المسؤولون tab on `/admin/clients`
 * (backlog 9.4b, `06-admin-v2.md` §3.8: "a tab, not a nav item"). Kept as a permanent
 * redirect (B4) — the page file that used to render the table here is deleted; the table
 * itself moved to `components/admin/admins-tab.tsx`.
 */
export default function AdminAdminsRedirect() {
  redirect("/admin/clients?tab=admins");
}
