import { redirect } from "next/navigation";
import { getCurrentUser, requirePartner, userHasAdminAccess } from "@/lib/auth/session";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  // Same "already logged in" redirect guard as /login (login.md's guard did not previously
  // exist here at all) — see docs/redesign/03-backlog.md 4.2, item 1.
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
      <RegisterForm />
    </div>
  );
}
