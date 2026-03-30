"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { cn } from "@/lib/utils";
import { Mail, Lock, User } from "lucide-react";

type AccountResponse = {
  phone: string;
  name: string | null;
  email: string | null;
  seniorVerified: boolean;
  nationalIdLast4: string | null;
};

export default function ProfileAccountPage() {
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [profilePhone, setProfilePhone] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");

  const [profileSaving, setProfileSaving] = React.useState(false);
  const [passwordSaving, setPasswordSaving] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = React.useState("");

  React.useEffect(() => {
    fetch("/api/profile/account", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) window.location.href = "/login?redirect=/profile/account";
        return parseJsonResponse<{ success?: boolean; data?: AccountResponse; error?: { message?: string } }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          setProfilePhone(json.data.phone ?? "");
          setName(json.data.name ?? "");
          setEmail(json.data.email ?? "");
        }
      })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

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
        <h1 className="text-2xl font-bold text-foreground">حسابي</h1>
        <p className="mt-2 text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">حسابي</h1>
        <p className="mt-1 text-sm text-muted-foreground">تحديث الاسم وكلمة المرور وإدارة البيانات</p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <User className="h-6 w-6 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground">بيانات الحساب</h2>
          </div>

          <form onSubmit={saveProfile} className="mt-4 grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">الاسم</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اكتب اسمك"
                className="rounded-xl"
                dir="rtl"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">البريد الإلكتروني (اختياري)</label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className={cn("rounded-xl pr-9", email ? "" : "")}
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">رقم الجوال</label>
              <Input value={profilePhone} disabled className="rounded-xl" dir="ltr" />
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="rounded-2xl" disabled={profileSaving}>
                {profileSaving ? "جاري الحفظ…" : "حفظ التعديلات"}
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-foreground" />
            <h2 className="text-lg font-semibold text-foreground">تغيير كلمة المرور</h2>
          </div>

          <form onSubmit={changePassword} className="mt-4 grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">كلمة المرور الحالية</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">كلمة المرور الجديدة</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="على الأقل 8 أحرف"
                className="rounded-xl"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">تأكيد كلمة المرور الجديدة</label>
              <Input
                type="password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="اكتبها مرة أخرى"
                className="rounded-xl"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" className="rounded-2xl" disabled={passwordSaving}>
                {passwordSaving ? "جاري التغيير…" : "تغيير كلمة المرور"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

