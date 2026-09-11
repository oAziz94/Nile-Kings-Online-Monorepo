import { redirect } from "next/navigation";
import { getCurrentUser, requirePartner, userHasAdminAccess } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
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
      <div className="mb-8">
        <div className="font-plex-arabic text-xs font-medium tracking-[0.02em] text-gold-600">
          حسابك
        </div>
        <h1 className="mt-3 font-amiri text-[32px] font-bold leading-[1.15] text-[hsl(228_40%_14%)] lg:text-[42px]">
          تسجيل الدخول
        </h1>
        <p className="mt-2 font-plex-arabic text-sm leading-[1.7] text-[hsl(228_18%_38%)]">
          رقم هاتفك هو معرّف حسابك.
        </p>
      </div>
      <LoginForm />
      {/* Mobile only (canvas screen 2g) — the desktop equivalent trust line lives in the shared
          layout (app/(auth)/layout.tsx), visible on every (auth) screen there, not just login. */}
      <p className="mt-auto pt-8 font-plex-arabic text-[11px] text-[hsl(228_10%_55%)] lg:hidden">
        توصيل إلى <span dir="ltr" className="font-archivo font-medium">27</span> محافظة
      </p>
    </div>
  );
}
