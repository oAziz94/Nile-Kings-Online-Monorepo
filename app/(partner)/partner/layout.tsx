import { redirect } from "next/navigation";
import { PartnerShell } from "@/components/partner/partner-shell";
import { getCurrentUser, requirePartner } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function PartnerPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?from=/partner");
  try {
    await requirePartner();
  } catch {
    redirect("/");
  }

  return <PartnerShell>{children}</PartnerShell>;
}
