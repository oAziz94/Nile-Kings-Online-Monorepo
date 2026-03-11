"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";

function fullPhone(countryCode: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  return countryCode + digits;
}

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const national = phone.trim();
    if (!national) {
      toast({ title: "أدخل رقم الجوال", variant: "destructive" });
      return;
    }
    if (!password) {
      toast({ title: "أدخل كلمة المرور", variant: "destructive" });
      return;
    }
    const full = fullPhone(countryCode, national);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: data?.error?.message ?? "فشل تسجيل الدخول",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      toast({ title: "تم تسجيل الدخول", variant: "success" });
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
      <h1 className="text-2xl font-bold text-foreground">تسجيل الدخول</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        أدخل رقم جوالك وكلمة المرور
      </p>

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div className="flex gap-2">
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
          <Input
            type="tel"
            placeholder="1xxxxxxxxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-2xl flex-1"
            dir="ltr"
            autoComplete="tel-national"
          />
        </div>
        <Input
          type="password"
          placeholder="كلمة المرور"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-2xl"
          autoComplete="current-password"
        />
        <p className="text-sm text-muted-foreground -mt-2">
          <Link href="/forgot-password" className="font-medium text-primary underline hover:no-underline">
            نسيت كلمة المرور؟
          </Link>
        </p>
        <Button type="submit" className="w-full rounded-2xl" disabled={loading}>
          {loading ? "جاري تسجيل الدخول…" : "تسجيل الدخول"}
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link href="/register" className="font-medium text-primary underline hover:no-underline">
          إنشاء حساب
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card animate-pulse h-80" />}>
      <LoginContent />
    </Suspense>
  );
}
