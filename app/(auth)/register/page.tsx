import Image from "next/image";
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
          إنشاء حساب
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدخل رقم الجوال ثم أكمل بياناتك لإنشاء حسابك
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
