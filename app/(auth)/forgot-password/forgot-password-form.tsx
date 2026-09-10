"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;
const MIN_PASSWORD_LEN = 8;

/**
 * Kept as a plain useState-driven 3-step wizard rather than converted to react-hook-form
 * (unlike login/register): this screen's steps aren't independent form submissions with their
 * own field-level validation so much as a server-driven state machine (resend cooldown ticking
 * every second, a reset token that must live only in React state — never persisted — auto-focus
 * management across 6 individual OTP boxes with paste-fanout). RHF's per-field model doesn't
 * map cleanly onto that and login/register's own conversions didn't need any of it. Real
 * accessible <Label>s (components/ui/label.tsx, the same primitive FormLabel wraps) are still
 * used throughout to meet the design system's accessibility bar, matching login/register's
 * fields visually without pulling in RHF.
 */
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
      // No auto-login on success (unlike register) — the only auth screen that doesn't sign
      // the user in, by design. They land back on /login and sign in with the new password.
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
      {step === "phone" && (
        <form onSubmit={handleRequestOtp} className="space-y-4">
          {/*
            Select-then-input order, the reverse of login/register's input-then-select — an
            intentional, preserved inconsistency, not a bug. See forgot-password.md's Notes and
            docs/redesign/03-backlog.md 4.3 "Field order quirk".
          */}
          <div className="space-y-2">
            <Label htmlFor="phone">رقم الهاتف</Label>
            <div className="flex gap-2">
              <Select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                dir="ltr"
                aria-label="رمز الدولة"
                className="w-auto min-w-[7rem] flex-none cursor-pointer"
              >
                {COUNTRY_CODES.map(({ code, country }) => (
                  <option key={code} value={code}>
                    {code} {country}
                  </option>
                ))}
              </Select>
              <Input
                id="phone"
                type="tel"
                placeholder="1xxxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                autoComplete="tel-national"
                className="flex-1"
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "جاري الإرسال…" : "إرسال رمز التحقق"}
          </Button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            أدخل الرمز المرسل إلى {countryCode} {phone}
          </p>
          <div className="flex justify-center gap-2" dir="ltr">
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <Input
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
                  "h-12 w-11 rounded-xl px-0 text-center text-lg font-semibold",
                  otpDigits[i] ? "border-primary" : ""
                )}
                aria-label={`رقم ${i + 1}`}
              />
            ))}
          </div>
          <Button
            type="submit"
            className="w-full"
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
        <form onSubmit={handleSetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
            <Input
              id="newPassword"
              type="password"
              placeholder={`كلمة المرور الجديدة (${MIN_PASSWORD_LEN} أحرف على الأقل)`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="تأكيد كلمة المرور"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
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

export function ForgotPasswordForm() {
  return (
    <Suspense
      fallback={
        <div className="h-80 w-full animate-pulse rounded-2xl border border-border bg-card p-6 shadow-card" />
      }
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
