"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/shared/skeleton";
import { useToast } from "@/hooks/use-toast";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { cn } from "@/lib/utils";
import {
  authLabelClass,
  authHelpClass,
  authFieldBoxClass,
  authBareInputClass,
  AuthSubmitButton,
  PasswordFieldBox,
} from "@/components/auth/auth-ui";

type AccountResponse = {
  phone: string;
  name: string | null;
  email: string | null;
  seniorVerified: boolean;
  nationalIdLast4: string | null;
};

function AccountSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل بيانات الحساب" className="flex flex-col gap-10">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
      <div className="flex flex-col gap-5 border-t border-[hsl(228_16%_84%)] pt-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </div>
  );
}

export default function ProfileAccountPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [profilePhone, setProfilePhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [seniorVerified, setSeniorVerified] = React.useState(false);

  const [profileSaving, setProfileSaving] = React.useState(false);
  const [passwordSaving, setPasswordSaving] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = React.useState("");

  React.useEffect(() => {
    fetch("/api/profile/account", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/account");
          return null;
        }
        return parseJsonResponse<{ success?: boolean; data?: AccountResponse; error?: { message?: string } }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          setProfilePhone(json.data.phone ?? "");
          setName(json.data.name ?? "");
          setEmail(json.data.email ?? "");
          setSeniorVerified(!!json.data.seniorVerified);
        }
      })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [router, toast]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileSaving) return;

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      toast({ title: "الاسم مطلوب (حرفان على الأقل)", variant: "destructive" });
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          email: email.trim() ? email.trim() : null,
        }),
      });

      if (res.status === 401) {
        router.replace("/login?redirect=/profile/account");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
      if (res.ok && json?.success) {
        toast({ title: "تم تحديث بيانات الحساب" });
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setProfileSaving(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordSaving) return;

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
      toast({ title: "أدخل كلمة المرور الحالية والجديدة وتأكيدها", variant: "destructive" });
      return;
    }

    if (newPassword.length < 8) {
      toast({ title: "كلمة المرور الجديدة مطلوبة (8 أحرف على الأقل)", variant: "destructive" });
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      toast({ title: "تأكيد كلمة المرور الجديدة غير مطابق", variant: "destructive" });
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          newPasswordConfirm,
        }),
      });

      if (res.status === 401) {
        router.replace("/login?redirect=/profile/account");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
      if (res.ok && json?.success) {
        toast({ title: "تم تغيير كلمة المرور بنجاح" });
        setCurrentPassword("");
        setNewPassword("");
        setNewPasswordConfirm("");
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setPasswordSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <AccountSkeleton />
      </div>
    );
  }

  return (
    <div>
      {/* No page-level h2 here: the shell's h1 is already "حسابي" and this route IS the account page
          (verifier a11y finding 2026-09-12 — a duplicate heading is noise in the outline). The two
          section headings are the page's h2s instead. */}
      {/* The "أنت مسجّل في العرض الخاص" status line is intentionally not rendered while the senior
          promo is hidden (user direction 2026-09-12, "not ready yet") — `seniorVerified` is still
          read so the line can come back with one condition when the promo launches. */}
      {seniorVerified && null}

      <div className="mt-6 flex flex-col gap-14">
        <section aria-labelledby="account-info-heading">
          <h2 id="account-info-heading" className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">
            بيانات الحساب
          </h2>

          <form onSubmit={saveProfile} className="mt-6 flex flex-col gap-6">
            <div className="space-y-2.5">
              <label htmlFor="account-name" className={authLabelClass}>
                الاسم
              </label>
              <div className={authFieldBoxClass()}>
                <input
                  id="account-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اكتب اسمك"
                  className={authBareInputClass}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label htmlFor="account-email" className={authLabelClass}>
                البريد الإلكتروني (اختياري)
              </label>
              <div className={authFieldBoxClass()}>
                <input
                  id="account-email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  dir="ltr"
                  className={authBareInputClass}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <label htmlFor="account-phone" className={authLabelClass}>
                رقم الجوال
              </label>
              <div className={authFieldBoxClass()}>
                <input
                  id="account-phone"
                  value={profilePhone}
                  disabled
                  dir="ltr"
                  className={cn(authBareInputClass, "cursor-not-allowed opacity-70")}
                />
              </div>
              <p className={authHelpClass}>رقم الهاتف هو معرّف حسابك ولا يمكن تغييره من هنا.</p>
            </div>

            <AuthSubmitButton disabled={profileSaving} className="h-14 w-full max-w-xs">
              {profileSaving ? "جاري الحفظ…" : "حفظ التعديلات"}
            </AuthSubmitButton>
          </form>
        </section>

        <section aria-labelledby="account-password-heading" className="border-t border-[hsl(228_16%_84%)] pt-10">
          <h2 id="account-password-heading" className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">
            تغيير كلمة المرور
          </h2>

          <form onSubmit={changePassword} className="mt-6 flex flex-col gap-6">
            <div className="space-y-2.5">
              <label htmlFor="current-password" className={authLabelClass}>
                كلمة المرور الحالية
              </label>
              <PasswordFieldBox
                id="current-password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="new-password" className={authLabelClass}>
                كلمة المرور الجديدة
              </label>
              <PasswordFieldBox
                id="new-password"
                placeholder="على الأقل 8 أحرف"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2.5">
              <label htmlFor="new-password-confirm" className={authLabelClass}>
                تأكيد كلمة المرور الجديدة
              </label>
              <PasswordFieldBox
                id="new-password-confirm"
                placeholder="اكتبها مرة أخرى"
                autoComplete="new-password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </div>

            <AuthSubmitButton disabled={passwordSaving} className="h-14 w-full max-w-xs">
              {passwordSaving ? "جاري التغيير…" : "تغيير كلمة المرور"}
            </AuthSubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
