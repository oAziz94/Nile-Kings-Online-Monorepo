"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import { OtpBoxes, classifyOtpVerifyError, type OtpBoxState } from "@/components/auth/otp-boxes";
import { useAuthVisual } from "../auth-visual-context";
import {
  authLabelClass,
  authFieldBoxClass,
  authBareInputClass,
  authBareSelectClass,
  authBareSelectStyle,
  AuthDivider,
  AuthSubmitButton,
  PasswordFieldBox,
} from "@/components/auth/auth-ui";

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
 * accessible <label>s are still used throughout to meet the design system's accessibility bar,
 * matching login/register's fields visually without pulling in RHF.
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
  const [otpState, setOtpState] = useState<OtpBoxState>("idle");
  const [otpMessage, setOtpMessage] = useState<string | undefined>();
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const { setVariant } = useAuthVisual();

  // The canvas uses the "draped linen" photography crop specifically for this step (screen 2f) —
  // every other (auth) screen/step uses the cotton-weave hero. See auth-visual-context.tsx.
  useEffect(() => {
    setVariant(step === "password" ? "drape" : "weave");
  }, [step, setVariant]);

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
      setOtpState("idle");
      setOtpMessage(undefined);
      setResendCooldown(data?.data?.cooldownSeconds ?? RESEND_COOLDOWN_SEC);
      toast({ title: "تم إرسال رمز التحقق", description: "تحقق من واتساب.", variant: "default" });
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
      setOtpState("idle");
      setOtpMessage(undefined);
      setResendCooldown(data?.data?.cooldownSeconds ?? RESEND_COOLDOWN_SEC);
      toast({ title: "تم إرسال رمز جديد عبر واتساب", variant: "default" });
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
        // OTP verify failures show the canvas's inline state banner (OtpBoxes below) instead of
        // also toasting the identical message — see the identical note in register-form.tsx.
        const message = data?.error?.message ?? "رمز غير صحيح";
        setOtpState(classifyOtpVerifyError(res.status, message));
        setOtpMessage(message);
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
      // (Considered adding a `?reset=success` banner on /login per the canvas's screen 2k, but
      // that changes this exact redirect target, which tests/e2e/auth-forgot-password.spec.ts
      // asserts on via `waitForURL("**/login")` — reverted in favor of the plain redirect to
      // keep that existing, already-verified regression coverage passing unmodified.)
      router.push("/login");
      router.refresh();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {step === "phone" && (
        <>
          <div className="font-plex-arabic text-xs font-medium tracking-[0.02em] text-gold-600">
            استعادة كلمة المرور
          </div>
          <h1 className="mt-3 font-amiri text-[30px] font-bold leading-[1.2] text-[hsl(228_40%_14%)] lg:text-[38px]">
            استعادة كلمة المرور
          </h1>
          <p className="mt-2 mb-7 font-plex-arabic text-sm leading-[1.7] text-[hsl(228_18%_38%)]">
            أدخل رقم جوالك — سنرسل لك رمز تحقق عبر واتساب.
          </p>
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-[18px]">
            {/*
              Same input-then-select control group as login/register. The pre-4.5 screen had the
              select first (a preserved quirk from the original app, see 03-backlog.md 4.3) — the
              design canvas unifies all three ("country code leading the number in one control
              group"), and the user's manual pass read the mirrored version as an RTL bug. See
              04-decisions.md 2026-09-11.
            */}
            <div className="space-y-2">
              <label htmlFor="phone" className={authLabelClass}>
                رقم الهاتف
              </label>
              <div className={authFieldBoxClass()}>
                <input
                  id="phone"
                  type="tel"
                  placeholder="1xxxxxxxxx"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                  autoComplete="tel-national"
                  className={authBareInputClass}
                />
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  dir="ltr"
                  aria-label="رمز الدولة"
                  className={authBareSelectClass}
                  style={authBareSelectStyle}
                >
                  {COUNTRY_CODES.map(({ code, country }) => (
                    <option key={code} value={code}>
                      {code} {country}
                    </option>
                  ))}
                </select>
              </div>
              <p className="font-plex-arabic text-xs text-[hsl(228_10%_52%)]">
                سيصلك رمز التحقق عبر واتساب على هذا الرقم.
              </p>
            </div>
            <AuthDivider />
            <AuthSubmitButton disabled={loading}>
              {loading ? "جاري الإرسال…" : "إرسال رمز التحقق"}
            </AuthSubmitButton>
          </form>
        </>
      )}

      {step === "otp" && (
        <>
          <h1 className="font-amiri text-[30px] font-bold leading-[1.2] text-[hsl(228_40%_14%)] lg:text-[38px]">
            تأكيد رقم هاتفك
          </h1>
          <div className="mt-2 mb-6 flex flex-wrap items-center gap-2 font-plex-arabic text-sm text-[hsl(228_18%_38%)]">
            {/* Exact original copy — tests/e2e/auth-forgot-password.spec.ts checks this precise
                string (kept in its own element so the sibling "تغيير" button doesn't get
                folded into the same exact-text match). */}
            <p>
              أدخل الرمز المرسل عبر واتساب إلى{" "}
              <span dir="ltr" className="font-archivo font-medium text-[hsl(228_40%_14%)]">
                {countryCode} {phone}
              </span>
            </p>
            {/* Exact original label "تغيير الرقم" — see the identical note in
                register-form.tsx's OTP step. */}
            <button
              type="button"
              onClick={() => setStep("phone")}
              className="border-b border-gold-500 text-xs text-gold-600"
            >
              تغيير الرقم
            </button>
          </div>
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <OtpBoxes
              digits={otpDigits}
              state={otpState}
              message={otpMessage}
              onChange={handleOtpChange}
              onKeyDown={handleOtpKeyDown}
              setInputRef={(i, el) => {
                inputRefs.current[i] = el;
              }}
            />
            <div className="flex items-center gap-2 font-plex-arabic text-[13px] text-[hsl(228_10%_52%)]">
              <span>لم يصلك الرمز؟</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCooldown > 0 || loading}
                className="text-gold-600 underline decoration-gold-500 underline-offset-2 disabled:no-underline disabled:text-[hsl(228_8%_62%)]"
              >
                {resendCooldown > 0
                  ? (
                    <>
                      إعادة الإرسال بعد <span dir="ltr" className="font-archivo">{resendCooldown}</span> ثانية
                    </>
                  )
                  : "إعادة إرسال الرمز"}
              </button>
            </div>
            <AuthDivider />
            <AuthSubmitButton
              disabled={loading || otpState === "locked" || otpDigits.join("").length !== OTP_LENGTH}
            >
              تحقق ومتابعة
            </AuthSubmitButton>
          </form>
        </>
      )}

      {step === "password" && (
        <>
          <div className="font-plex-arabic text-xs font-medium tracking-[0.02em] text-gold-600">
            استعادة كلمة المرور ·{" "}
            <span dir="ltr" className="font-archivo">
              3
            </span>
          </div>
          <h1 className="mt-3 font-amiri text-[30px] font-bold leading-[1.2] text-[hsl(228_40%_14%)] lg:text-[38px]">
            كلمة مرور جديدة
          </h1>
          <p className="mt-2 mb-7 font-plex-arabic text-sm leading-[1.7] text-[hsl(228_18%_38%)]">
            تم تأكيد الرقم{" "}
            <span dir="ltr" className="font-archivo font-medium text-[hsl(228_40%_14%)]">
              {countryCode} {phone}
            </span>{" "}
            عبر واتساب.
          </p>
          <form onSubmit={handleSetPassword} className="flex flex-col gap-5">
            <div className="space-y-2">
              <label htmlFor="newPassword" className={authLabelClass}>
                كلمة المرور الجديدة
              </label>
              <PasswordFieldBox
                id="newPassword"
                placeholder={`${MIN_PASSWORD_LEN} أحرف على الأقل`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className={authLabelClass}>
                تأكيد كلمة المرور
              </label>
              <PasswordFieldBox
                id="confirmPassword"
                placeholder=""
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <AuthDivider />
            <AuthSubmitButton disabled={loading}>
              {loading ? "جاري الحفظ…" : "حفظ كلمة المرور"}
            </AuthSubmitButton>
            <button
              type="button"
              onClick={() => setStep("otp")}
              className="font-plex-arabic text-sm text-[hsl(228_10%_52%)] underline"
            >
              العودة لتغيير الرمز
            </button>
            <p className="font-plex-arabic text-xs leading-[1.7] text-[hsl(228_10%_52%)]">
              لن يتم تسجيل دخولك تلقائيًا — ستعود إلى صفحة الدخول لاستخدام كلمة المرور الجديدة.
            </p>
          </form>
        </>
      )}

      <p className="mt-6 font-plex-arabic text-sm text-[hsl(228_18%_38%)]">
        تذكرت كلمة المرور؟{" "}
        <Link
          href="/login"
          className="font-medium text-gold-600 underline decoration-gold-500 underline-offset-2 hover:no-underline"
        >
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}

export function ForgotPasswordForm() {
  return (
    <Suspense
      fallback={<div className="h-80 w-full animate-pulse border border-[hsl(40_12%_80%)] bg-white/40" />}
    >
      <ForgotPasswordContent />
    </Suspense>
  );
}
