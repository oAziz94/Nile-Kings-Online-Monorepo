"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";

const MIN_PASSWORD_LEN = 8;

function fullPhone(countryCode: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  return countryCode + digits;
}

type Step = "phone" | "profile";

function RegisterContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handlePhoneNext = (e: React.FormEvent) => {
    e.preventDefault();
    const national = phone.trim();
    if (!national) {
      toast({ title: "أدخل رقم الجوال", variant: "destructive" });
      return;
    }
    setStep("profile");
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const national = phone.trim();
    if (!name.trim() || name.trim().length < 2) {
      toast({ title: "الاسم مطلوب (حرفان على الأقل)", variant: "destructive" });
      return;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      toast({
        title: `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LEN} أحرف على الأقل`,
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    const full = fullPhone(countryCode, national);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: full,
          name: name.trim(),
          email: email.trim() || undefined,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data?.error?.message ?? "فشل إنشاء الحساب", variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: "تم إنشاء الحساب", variant: "success" });
      const path = redirectTo?.startsWith("/") ? redirectTo : "/";
      router.push(path);
      router.refresh();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card">
      <h1 className="text-2xl font-bold text-foreground">إنشاء حساب</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        أدخل رقم الجوال ثم أكمل بياناتك
      </p>

      {step === "phone" && (
        <form onSubmit={handlePhoneNext} className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Input
              type="tel"
              placeholder="1xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-2xl flex-1"
              dir="ltr"
              autoComplete="tel-national"
            />
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className={cn(
                "h-10 rounded-2xl border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "min-w-[7rem] cursor-pointer"
              )}
              dir="ltr"
              aria-label="رمز الدولة"
            >
              {COUNTRY_CODES.map(({ code, country }) => (
                <option key={code} value={code}>
                  {code} {country}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" className="w-full rounded-2xl">
            متابعة
          </Button>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={handleRegister} className="mt-6 space-y-4">
          <Input
            type="text"
            placeholder="الاسم الكامل"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-2xl"
            autoComplete="name"
          />
          <Input
            type="email"
            placeholder="البريد الإلكتروني (اختياري)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-2xl"
            autoComplete="email"
          />
          <Input
            type="password"
            placeholder={`كلمة المرور (${MIN_PASSWORD_LEN} أحرف على الأقل)`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-2xl"
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder="تأكيد كلمة المرور"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-2xl"
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full rounded-2xl" disabled={loading}>
            {loading ? "جاري إنشاء الحساب…" : "إنشاء الحساب"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setStep("phone")}
          >
            تغيير الرقم
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-muted-foreground">
        لديك حساب؟{" "}
        <Link href="/login" className="font-medium text-primary underline hover:no-underline">
          تسجيل الدخول
        </Link>
      </p>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="underline hover:text-foreground">
          العودة للمتجر
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card animate-pulse h-80" />}>
      <RegisterContent />
    </Suspense>
  );
}
