import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PartnerShell } from "@/components/partner/partner-shell";
import { getCurrentUser, requirePartner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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

  return <PartnerShell>{children}</PartnerShell>;
}
