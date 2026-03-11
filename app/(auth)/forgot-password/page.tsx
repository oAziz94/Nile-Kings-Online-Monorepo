"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

type Step = "phone" | "otp" | "password";

function ForgotPasswordContent() {
  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
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
      const res = await fetch("/api/auth/forgot-password/request", {
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
      const res = await fetch("/api/auth/forgot-password/request", {
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

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== OTP_LENGTH) {
      toast({ title: "أدخل الرمز المكون من 6 أرقام", variant: "destructive" });
      return;
    }
    const full = fullPhone(countryCode, phone.trim());
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data?.error?.message ?? "رمز غير صحيح", variant: "destructive" });
        setLoading(false);
        return;
      }
      setResetToken(data?.data?.resetToken ?? null);
      setStep("password");
      toast({ title: "تم التحقق", description: "أدخل كلمة المرور الجديدة.", variant: "default" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LEN) {
      toast({
        title: `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LEN} أحرف على الأقل`,
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "كلمتا المرور غير متطابقتين", variant: "destructive" });
      return;
    }
    if (!resetToken) {
      toast({ title: "انتهت الجلسة. أعد طلب استعادة كلمة المرور.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data?.error?.message ?? "فشل تغيير كلمة المرور", variant: "destructive" });
        setLoading(false);
        return;
      }
      toast({ title: "تم تغيير كلمة المرور", variant: "success" });
      router.push("/login");
      router.refresh();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card">
      <h1 className="text-2xl font-bold text-foreground">استعادة كلمة المرور</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        أدخل رقم جوالك لاستلام رمز التحقق ثم اختر كلمة مرور جديدة
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
              placeholder="1xxxxxxxxx"
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
        <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            أدخل الرمز المرسل إلى {countryCode} {phone}
          </p>
          <div className="flex justify-center gap-2" dir="ltr">
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
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
            تحقق ومتابعة
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

      {step === "password" && (
        <form onSubmit={handleSetPassword} className="mt-6 space-y-4">
          <Input
            type="password"
            placeholder={`كلمة المرور الجديدة (${MIN_PASSWORD_LEN} أحرف على الأقل)`}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
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
            {loading ? "جاري الحفظ…" : "حفظ كلمة المرور"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setStep("otp")}
          >
            العودة لتغيير الرمز
          </Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-muted-foreground">
        تذكرت كلمة المرور؟{" "}
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

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card animate-pulse h-80" />
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
