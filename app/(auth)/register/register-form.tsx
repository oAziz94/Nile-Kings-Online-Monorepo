"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import { Ankh } from "@/components/brand/ankh";
import { OtpBoxes, classifyOtpVerifyError, type OtpBoxState } from "@/components/auth/otp-boxes";
import { useAuthVisual } from "../auth-visual-context";
import { cn } from "@/lib/utils";
import {
  authLabelClass,
  authHelpClass,
  authFieldBoxClass,
  authBareInputClass,
  authBareSelectClass,
  authBareSelectStyle,
  authInlineActionClass,
  AuthDivider,
  AuthFieldDivider,
  AuthSubmitButton,
  PasswordFieldBox,
} from "@/components/auth/auth-ui";

const MIN_PASSWORD_LEN = 8;
const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SEC = 60;

/**
 * Same guard as login (app/(auth)/login/login-form.tsx) — copied, not reinvented, per
 * docs/redesign/03-backlog.md 4.2 "Fix register's weaker open-redirect guard": register
 * previously only checked `redirectTo?.startsWith("/")`, missing the "//host" and "/\\host"
 * protections login already had.
 */
function safeRedirect(target: string | null): string | null {
  if (!target) return null;
  if (!target.startsWith("/")) return null;
  if (target.startsWith("//") || target.startsWith("/\\")) return null;
  return target;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function fullPhone(countryCode: string, national: string): string {
  return countryCode + digitsOnly(national);
}

type Step = "phone" | "otp" | "profile";

const STEP_INDEX: Record<Step, 1 | 2 | 3> = { phone: 1, otp: 2, profile: 3 };

/** Canvas's 3-part "1 · الهاتف / 2 · التحقق / 3 · بياناتك" step tracker, screens 2c/2d/2e. */
function StepTracker({ current }: { current: 1 | 2 | 3 }) {
  const steps: [1 | 2 | 3, string][] = [
    [1, "الهاتف"],
    [2, "التحقق"],
    [3, "بياناتك"],
  ];
  return (
    <div className="mb-6 flex border-t-2 border-[hsl(40_12%_80%)]">
      {steps.map(([n, label]) => (
        <div
          key={n}
          className={
            n <= current
              ? "-mt-0.5 flex-1 border-t-2 border-[hsl(228_40%_14%)] pt-2"
              : "flex-1 pt-2"
          }
        >
          <span
            className={
              n === current
                ? "font-plex-arabic text-[11px] font-semibold tracking-[0.1em] text-[hsl(228_40%_14%)]"
                : "font-plex-arabic text-[11px] tracking-[0.1em] text-[hsl(228_10%_58%)]"
            }
          >
            <span dir="ltr" className="font-archivo">
              {n}
            </span>{" "}
            · {label}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Backlog 4.4 (WhatsApp OTP via WaPilot): reinstates OTP verification at registration —
 * phone -> WhatsApp OTP -> profile -> create account, a step-order change from the previous
 * phone -> profile -> submit flow (docs/redesign/04-decisions.md 2026-09-10). The new "otp" step
 * is modeled closely on app/(auth)/forgot-password/forgot-password-form.tsx's existing OTP step
 * (segmented 6-box input, auto-advance/backspace/paste-fanout, resend cooldown read from the
 * server response, "تغيير الرقم" back-navigation) rather than inventing a new pattern. The
 * "phone" and "profile" steps keep their existing react-hook-form + Zod wiring from 4.2
 * unchanged; only the "phone" step's continue action now makes a real network call (send OTP)
 * instead of a purely client-side step transition, and the final submit now carries a
 * `registerToken` (proof of completed OTP verification) instead of a raw phone number.
 */
const registerFormSchema = z
  .object({
    countryCode: z.string().min(1),
    phone: z.string().trim().min(1, "أدخل رقم الجوال"),
    name: z.string().trim().min(2, "الاسم مطلوب (حرفان على الأقل)"),
    email: z.string().trim(),
    password: z.string().min(MIN_PASSWORD_LEN, `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LEN} أحرف على الأقل`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirmPassword"],
  });
type RegisterFormValues = z.infer<typeof registerFormSchema>;

function RegisterContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const [step, setStep] = useState<Step>("phone");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [otpState, setOtpState] = useState<OtpBoxState>("idle");
  const [otpMessage, setOtpMessage] = useState<string | undefined>();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { toast } = useToast();
  const router = useRouter();
  const { setVariant } = useAuthVisual();

  // See login-form.tsx's identical effect: the (auth) layout persists across sibling-route
  // navigations, so assert this screen's own hero variant on mount rather than trusting
  // whatever forgot-password may have last set it to.
  useEffect(() => {
    setVariant("drape");
  }, [setVariant]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      countryCode: DEFAULT_COUNTRY_CODE,
      phone: "",
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });
  const loading = form.formState.isSubmitting;

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const requestOtp = useCallback(
    async (full: string) => {
      const res = await fetch("/api/auth/register/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full }),
      });
      const data = await res.json();
      return { ok: res.ok, data };
    },
    []
  );

  const handleContinue = async () => {
    const valid = await form.trigger("phone");
    if (!valid) {
      toast({
        title: form.formState.errors.phone?.message ?? "أدخل رقم الجوال",
        variant: "destructive",
      });
      return;
    }
    const { countryCode, phone } = form.getValues();
    const full = fullPhone(countryCode, phone);
    setOtpLoading(true);
    try {
      const { ok, data } = await requestOtp(full);
      if (!ok) {
        toast({ title: data?.error?.message ?? "فشل إرسال الرمز", variant: "destructive" });
        return;
      }
      setStep("otp");
      setOtpDigits(Array(OTP_LENGTH).fill(""));
      setOtpState("idle");
      setOtpMessage(undefined);
      setResendCooldown(data?.data?.cooldownSeconds ?? RESEND_COOLDOWN_SEC);
      toast({
        title: "تم إرسال رمز التحقق عبر واتساب",
        description: "تحقق من واتساب.",
        variant: "default",
      });
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const { countryCode, phone } = form.getValues();
    const full = fullPhone(countryCode, phone);
    setOtpLoading(true);
    try {
      const { ok, data } = await requestOtp(full);
      if (!ok) {
        toast({ title: data?.error?.message ?? "فشل إعادة الإرسال", variant: "destructive" });
        return;
      }
      setOtpState("idle");
      setOtpMessage(undefined);
      setResendCooldown(data?.data?.cooldownSeconds ?? RESEND_COOLDOWN_SEC);
      toast({ title: "تم إرسال رمز جديد عبر واتساب", variant: "default" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setOtpLoading(false);
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
    const { countryCode, phone } = form.getValues();
    const full = fullPhone(countryCode, phone);
    setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        // OTP verify failures show the canvas's inline state banner (OtpBoxes below) instead of
        // also toasting the identical message — the two together would be a redundant, doubly
        // announced (both are alert/aria-live regions) duplicate of the same text. Every other
        // error on this screen still toasts, unchanged.
        const message = data?.error?.message ?? "رمز غير صحيح";
        setOtpState(classifyOtpVerifyError(res.status, message));
        setOtpMessage(message);
        return;
      }
      setRegisterToken(data?.data?.registerToken ?? null);
      setStep("profile");
      toast({ title: "تم التحقق", description: "أكمل بياناتك لإنشاء الحساب.", variant: "default" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setOtpLoading(false);
    }
  };

  const onSubmit = async (values: RegisterFormValues) => {
    if (!registerToken) {
      toast({
        title: "انتهت جلسة التحقق. أعد طلب رمز التحقق.",
        variant: "destructive",
      });
      setStep("otp");
      return;
    }
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registerToken,
          name: values.name.trim(),
          email: values.email.trim() || undefined,
          password: values.password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: data?.error?.message ?? "فشل إنشاء الحساب",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "تم إنشاء الحساب", variant: "success" });
      const path = safeRedirect(redirectTo) ?? "/";
      router.push(path);
      router.refresh();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  // Preserves the pre-redesign UX exactly: client validation surfaces as a destructive
  // toast (name -> password length -> password mismatch, in that order, matching
  // register.md's "Submit flow" list), not inline red border/helper text.
  const onInvalid = (errors: FieldErrors<RegisterFormValues>) => {
    if (errors.name) {
      toast({ title: errors.name.message ?? "الاسم مطلوب (حرفان على الأقل)", variant: "destructive" });
      return;
    }
    if (errors.password) {
      toast({
        title: errors.password.message ?? `كلمة المرور يجب أن تكون ${MIN_PASSWORD_LEN} أحرف على الأقل`,
        variant: "destructive",
      });
      return;
    }
    if (errors.confirmPassword) {
      toast({ title: errors.confirmPassword.message ?? "كلمتا المرور غير متطابقتين", variant: "destructive" });
    }
  };

  return (
    <div className="w-full">
      <StepTracker current={STEP_INDEX[step]} />

      {step === "phone" && (
        <>
          <h1 className="font-amiri text-[36px] font-bold leading-[1.1] text-[hsl(228_40%_14%)] lg:text-[46px]">
            إنشاء حساب جديد
          </h1>
          <p className="mt-3 mb-8 font-plex-arabic text-[15px] leading-[1.8] text-[hsl(228_18%_32%)]">
            رقم هاتفك أولًا — يؤكد عبر واتساب ثم يكمل الباقي.
          </p>
          <Form {...form}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleContinue();
              }}
              className="flex flex-col gap-6"
            >
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="space-y-2.5">
                    <FormLabel className={authLabelClass}>رقم الهاتف</FormLabel>
                    <div className={authFieldBoxClass()}>
                      <FormControl>
                        <input
                          type="tel"
                          placeholder="1xxxxxxxxx"
                          dir="ltr"
                          autoComplete="tel-national"
                          className={authBareInputClass}
                          {...field}
                        />
                      </FormControl>
                      <AuthFieldDivider />
                      <select
                        {...form.register("countryCode")}
                        defaultValue={DEFAULT_COUNTRY_CODE}
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
                    {/* The one WhatsApp sentence used on all three screens (art-direction brief
                        §9) — it replaced both the older helper line and the canvas's teal notice
                        box that repeated it. tests/e2e/auth-register.spec.ts asserts on the
                        "رمز التحقق عبر واتساب" substring. */}
                    <FormDescription className={authHelpClass}>
                      سيُرسل رمز التحقق عبر واتساب إلى هذا الرقم.
                    </FormDescription>
                  </FormItem>
                )}
              />

              <AuthDivider />

              {/* Label kept as "متابعة" (not the canvas's "إرسال رمز واتساب") — this is the
                  existing, already-verified copy from backlog 4.4's WhatsApp-OTP register flow,
                  and tests/e2e/auth-register.spec.ts locates this button by that exact name;
                  the canvas's copy differs here and isn't a rebrand-driven change, so parity
                  wins per this task's own "compare carefully" instruction. */}
              <AuthSubmitButton disabled={otpLoading}>
                {otpLoading ? "جاري الإرسال…" : "متابعة"}
              </AuthSubmitButton>

              <p className="font-plex-arabic text-[11px] leading-[1.65] text-[hsl(228_10%_52%)]">
                بإنشاء الحساب أنت توافق على{" "}
                <Link href="/terms" className="text-gold-600 underline">
                  الشروط
                </Link>{" "}
                و
                <Link href="/privacy" className="text-gold-600 underline">
                  سياسة الخصوصية
                </Link>
                .
              </p>
            </form>
          </Form>
        </>
      )}

      {step === "otp" && (
        <>
          <h1 className="font-amiri text-[36px] font-bold leading-[1.1] text-[hsl(228_40%_14%)] lg:text-[46px]">
            تأكيد رقم هاتفك
          </h1>
          <div className="mt-3 mb-7 flex flex-wrap items-center gap-2 font-plex-arabic text-[15px] leading-[1.8] text-[hsl(228_18%_32%)]">
            {/* Exact original copy — tests/e2e/auth-register.spec.ts checks this precise
                string (kept in its own element so the sibling "تغيير" button doesn't get
                folded into the same exact-text match). */}
            <p>
              أدخل الرمز المرسل عبر واتساب إلى{" "}
              <span dir="ltr" className="font-archivo font-medium text-[hsl(228_40%_14%)]">
                {form.getValues("countryCode")} {form.getValues("phone")}
              </span>
            </p>
            {/* Exact original label "تغيير الرقم" (not the canvas's shorter "تغيير") — this is
                the existing back-navigation control tests/e2e/auth-register.spec.ts locates by
                name; kept functionally identical, just re-styled per the canvas's inline
                placement next to the phone number instead of its previous spot at the form's
                bottom. */}
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
                disabled={resendCooldown > 0 || otpLoading}
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
            {/* "تحقق ومتابعة" (not the canvas's "تأكيد الرمز") — exact original label, matches
                forgot-password's identical OTP-confirm button; tests/e2e/auth-register.spec.ts
                locates this button by name. */}
            <AuthSubmitButton
              disabled={otpLoading || otpState === "locked" || otpDigits.join("").length !== OTP_LENGTH}
            >
              تحقق ومتابعة
            </AuthSubmitButton>
            <p className="font-plex-arabic text-[13.5px] leading-[1.7] text-[hsl(228_10%_52%)]">
              الرمز صالح <span dir="ltr" className="font-archivo font-medium">10</span> دقائق ·
              سلتك محفوظة طوال هذه الخطوة.
            </p>
          </form>
        </>
      )}

      {step === "profile" && (
        <>
          <div className="flex items-center gap-3">
            <h1 className="font-amiri text-[36px] font-bold leading-[1.1] text-[hsl(228_40%_14%)] lg:text-[46px]">
              بياناتك
            </h1>
            <span className="flex items-center gap-1.5 font-plex-arabic text-xs text-[hsl(150_36%_28%)]">
              <Ankh animateDraw drawDelayMs={300} size={16} strokeWidth={11} className="text-[hsl(150_36%_30%)]" />
              الرقم مؤكد
            </span>
          </div>
          <p className="mt-2 mb-7 font-plex-arabic text-[15px] leading-[1.8] text-[hsl(228_18%_32%)]">
            خطوة أخيرة — ثم نعيدك إلى إتمام الشراء.
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={authLabelClass}>الاسم الكامل</FormLabel>
                    <div className={authFieldBoxClass()}>
                      <FormControl>
                        <input
                          type="text"
                          placeholder="الاسم الكامل"
                          autoComplete="name"
                          className={authBareInputClass}
                          {...field}
                        />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className={authLabelClass}>
                      البريد الإلكتروني{" "}
                      <span className="font-normal text-[hsl(228_10%_58%)]">— اختياري، للفواتير</span>
                    </FormLabel>
                    <div className={authFieldBoxClass()}>
                      <FormControl>
                        <input
                          type="email"
                          placeholder="name@example.com"
                          dir="ltr"
                          autoComplete="email"
                          className={authBareInputClass}
                          {...field}
                        />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex gap-3.5">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-1.5">
                      <FormLabel className={authLabelClass}>كلمة المرور</FormLabel>
                      <FormControl>
                        <PasswordFieldBox
                          placeholder=""
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <p className="font-plex-arabic text-[11.5px] text-[hsl(228_10%_52%)]">
                        <span dir="ltr" className="font-archivo font-medium">8</span> أحرف على الأقل
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem className="flex-1 space-y-1.5">
                      <FormLabel className={authLabelClass}>تأكيد كلمة المرور</FormLabel>
                      <FormControl>
                        <PasswordFieldBox
                          placeholder=""
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <p className="font-plex-arabic text-xs text-[hsl(228_10%_52%)]">
                بإنشاء الحساب، أنت توافق على{" "}
                <Link href="/terms" className="font-medium text-gold-600 underline">
                  الشروط والأحكام
                </Link>{" "}
                و
                <Link href="/privacy" className="font-medium text-gold-600 underline">
                  سياسة الخصوصية
                </Link>
                .
              </p>

              <AuthDivider />

              {/* "إنشاء الحساب" (not the canvas's "إنشاء الحساب ومتابعة الشراء") — same parity
                  reasoning as the phone step's button above; tests/e2e/auth-register.spec.ts
                  locates this exact button name. */}
              <AuthSubmitButton disabled={loading}>
                {loading ? "جاري إنشاء الحساب…" : "إنشاء الحساب"}
              </AuthSubmitButton>
              <button
                type="button"
                onClick={() => setStep("otp")}
                className="font-plex-arabic text-sm text-[hsl(228_10%_52%)] underline"
              >
                العودة لتغيير الرمز
              </button>
            </form>
          </Form>
        </>
      )}

      <p className="mt-7 font-plex-arabic text-[14px] text-[hsl(228_18%_40%)]">
        لديك حساب؟{" "}
        <Link href="/login" className={cn(authInlineActionClass, "inline-block py-2 text-[15px]")}>
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  return (
    <Suspense
      fallback={<div className="h-80 w-full animate-pulse border border-[hsl(40_12%_80%)] bg-white/40" />}
    >
      <RegisterContent />
    </Suspense>
  );
}
