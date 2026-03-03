"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;
const MIN_PASSWORD_LEN = 8;

function fullPhone(countryCode: string, national: string): string {
  const digits = national.replace(/\D/g, "");
  return countryCode + digits;
}

type Step = "phone" | "otp" | "profile";

function RegisterContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const national = phone.trim();
    if (!national) {
      toast({ title: "أدخل رقم الجوال", variant: "destructive" });
      return;
    }
    const full = fullPhone(countryCode, national);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data?.error?.message ?? "فشل إرسال الرمز", variant: "destructive" });
        setLoading(false);
        return;
      }
      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setResendCooldown(data?.data?.cooldownSeconds ?? RESEND_COOLDOWN_SEC);
      toast({ title: "تم إرسال رمز التحقق", description: "تحقق من رسائلك.", variant: "default" });
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const full = fullPhone(countryCode, phone.trim());
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data?.error?.message ?? "فشل إعادة الإرسال", variant: "destructive" });
        setLoading(false);
        return;
      }
      setResendCooldown(data?.data?.cooldownSeconds ?? RESEND_COOLDOWN_SEC);
      toast({ title: "تم إرسال رمز جديد", variant: "default" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = useCallback(
    (index: number, value: string) => {
      if (value.length > 1) {
        const digits = value.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
        const next = [...otpDigits];
        digits.forEach((d, i) => {
          if (index + i < OTP_LENGTH) next[index + i] = d;
        });
        setOtpDigits(next);
        const nextFocus = Math.min(index + digits.length, OTP_LENGTH - 1);
        inputRefs.current[nextFocus]?.focus();
        return;
      }
      const digit = value.replace(/\D/g, "").slice(-1);
      const next = [...otpDigits];
      next[index] = digit;
      setOtpDigits(next);
      if (digit && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
    },
    [otpDigits]
  );

  const handleOtpKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !otpDigits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [otpDigits]
  );

  const handleOtpNext = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== OTP_LENGTH) {
      toast({ title: "أدخل الرمز المكون من 6 أرقام", variant: "destructive" });
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
    const code = otpDigits.join("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: full,
          code,
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
        التحقق برمز OTP ثم إكمال بياناتك
      </p>

      {step === "phone" && (
        <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
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
              placeholder="5xxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-2xl flex-1"
              dir="ltr"
              autoComplete="tel-national"
            />
          </div>
          <Button type="submit" className="w-full rounded-2xl" disabled={loading}>
            {loading ? "جاري الإرسال…" : "إرسال رمز التحقق"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleOtpNext} className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            أدخل الرمز المرسل إلى {countryCode} {phone}
          </p>
          <div className="flex justify-center gap-2" dir="ltr">
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpDigits[i]}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                className={cn(
                  "h-12 w-11 rounded-xl border border-input bg-background text-center text-lg font-semibold ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  otpDigits[i] ? "border-primary" : ""
                )}
                aria-label={`رقم ${i + 1}`}
              />
            ))}
          </div>
          <Button
            type="submit"
            className="w-full rounded-2xl"
            disabled={loading || otpDigits.join("").length !== OTP_LENGTH}
          >
            متابعة
          </Button>
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading}
            >
              {resendCooldown > 0
                ? `إعادة الإرسال بعد ${resendCooldown} ثانية`
                : "إعادة إرسال الرمز"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("phone")}>
              تغيير الرقم
            </Button>
          </div>
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
            onClick={() => setStep("otp")}
          >
            تغيير الرقم أو الرمز
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
