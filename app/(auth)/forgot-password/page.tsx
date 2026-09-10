import Image from "next/image";
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
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src="/brand/logo-lapis-mark.png"
          alt="نايل كينجز"
          width={239}
          height={129}
          className="mb-3 h-12 w-auto"
          priority
        />
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
          استعادة كلمة المرور
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدخل رقم جوالك لاستلام رمز التحقق ثم اختر كلمة مرور جديدة
        </p>
      </div>
      <ForgotPasswordForm />
    </div>
  );
}
