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
      {/* Heading only — the canvas's small "حسابك" eyebrow was dropped in the 2026-09-11
          refinement (it labelled what the heading already says). */}
      <div className="mb-9 lg:mb-10">
        <h1 className="font-amiri text-[38px] font-bold leading-[1.1] text-[hsl(228_40%_14%)] lg:text-[50px]">
          تسجيل الدخول
        </h1>
        <p className="mt-3 font-plex-arabic text-[15px] leading-[1.8] text-[hsl(228_18%_32%)] lg:text-[15.5px]">
          رقم هاتفك هو معرّف حسابك.
        </p>
      </div>
      <LoginForm />
      {/* Mobile only — the desktop equivalent trust line lives in the shared layout
          (app/(auth)/layout.tsx), visible on every (auth) screen there, not just login. */}
      <p className="mt-auto pt-10 font-plex-arabic text-[11.5px] text-[hsl(228_10%_55%)] lg:hidden">
        توصيل إلى <span dir="ltr" className="font-archivo font-medium">27</span> محافظة
      </p>
    </div>
  );
}
