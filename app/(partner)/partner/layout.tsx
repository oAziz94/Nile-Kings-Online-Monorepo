import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PartnerShell } from "@/components/partner/partner-shell";
import { QueryProvider } from "@/components/providers/query-provider";
import { getCurrentUser, requirePartner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// `default` is only "لوحة الشريك" (not the full "... · قطن ملوك النيل") — the root layout's
// own `%s · قطن ملوك النيل` template still applies on top of whatever title this layout
// resolves to (its `default` included), so spelling out the site name here a second time
// would double it.
export const metadata: Metadata = {
  title: { default: "لوحة الشريك", template: "%s · لوحة الشريك" },
};

export default async function PartnerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    const pathname = (await headers()).get("x-pathname") ?? "/partner";
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }
  try {
    await requirePartner();
  } catch {
    redirect("/");
  }

  return (
    <QueryProvider>
      <PartnerShell>{children}</PartnerShell>
    </QueryProvider>
  );
}
