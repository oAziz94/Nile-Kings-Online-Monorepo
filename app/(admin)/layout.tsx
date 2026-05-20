import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser, userHasAdminAccess } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/admin");
  if (!(await userHasAdminAccess(user))) redirect("/");

  return <AdminShell>{children}</AdminShell>;
}
