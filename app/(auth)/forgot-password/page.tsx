import { redirect } from "next/navigation";
import { getCurrentUser, requirePartner, userHasAdminAccess } from "@/lib/auth/session";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  // Same "already logged in" redirect guard as /login and /register — forgot-password.md
  // confirmed this page previously had no server-side auth guard at all (pure client
  // component). See docs/redesign/03-backlog.md 4.3, "Approved changes" item 2.
  const user = await getCurrentUser();
  if (user) {
    if (await userHasAdminAccess(user)) redirect("/admin");
    try {
      await requirePartner();
    } catch {
      redirect("/");
    }
    redirect("/partner");
  }

  return (
    <div className="w-full">
      <ForgotPasswordForm />
    </div>
  );
}
