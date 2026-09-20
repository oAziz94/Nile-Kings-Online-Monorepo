import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AdminShell } from "@/components/admin/admin-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { getCurrentUser, userHasAdminAccess } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// `default` is only "لوحة الإدارة" (not the full "... · قطن ملوك النيل") — the root
// layout's own `%s · قطن ملوك النيل` template still applies on top of whatever title this
// layout resolves to (its `default` included), so spelling out the site name here a second
// time would double it.
export const metadata: Metadata = {
  title: { default: "لوحة الإدارة", template: "%s · لوحة الإدارة" },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    const pathname = (await headers()).get("x-pathname") ?? "/admin";
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }
  if (!(await userHasAdminAccess(user))) redirect("/");

  return (
    <QueryProvider>
      <AdminShell>{children}</AdminShell>
    </QueryProvider>
  );
}
