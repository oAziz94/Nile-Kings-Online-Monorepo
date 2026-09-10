"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";

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
  const [resendCooldown, setResendCooldown] = useState(0);
  const [registerToken, setRegisterToken] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { toast } = useToast();
  const router = useRouter();

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
        toast({ title: data?.error?.message ?? "رمز غير صحيح", variant: "destructive" });
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
    <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card">
      <Form {...form}>
        {step === "phone" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleContinue();
            }}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>رقم الهاتف</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="1xxxxxxxxx"
                        dir="ltr"
                        autoComplete="tel-national"
                        className="flex-1"
                        {...field}
                      />
                    </FormControl>
                    <Select
                      {...form.register("countryCode")}
                      defaultValue={DEFAULT_COUNTRY_CODE}
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
                  </div>
                  <FormDescription>سيصلك رمز التحقق عبر واتساب على هذا الرقم.</FormDescription>
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={otpLoading}>
              {otpLoading ? "جاري الإرسال…" : "متابعة"}
            </Button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              أدخل الرمز المرسل عبر واتساب إلى {form.getValues("countryCode")} {form.getValues("phone")}
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
              disabled={otpLoading || otpDigits.join("").length !== OTP_LENGTH}
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
                disabled={resendCooldown > 0 || otpLoading}
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
          <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الاسم الكامل</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="الاسم الكامل" autoComplete="name" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>البريد الإلكتروني (اختياري)</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="البريد الإلكتروني (اختياري)"
                      autoComplete="email"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>كلمة المرور</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder={`كلمة المرور (${MIN_PASSWORD_LEN} أحرف على الأقل)`}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>تأكيد كلمة المرور</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="تأكيد كلمة المرور"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <p className="text-xs text-muted-foreground">
              بإنشاء الحساب، أنت توافق على{" "}
              <Link href="/terms" className="font-medium text-primary underline hover:no-underline">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link href="/privacy" className="font-medium text-primary underline hover:no-underline">
                سياسة الخصوصية
              </Link>
              .
            </p>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "جاري إنشاء الحساب…" : "إنشاء الحساب"}
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
      </Form>

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

export function RegisterForm() {
  return (
    <Suspense
      fallback={
        <div className="h-80 w-full animate-pulse rounded-2xl border border-border bg-card p-6 shadow-card" />
      }
    >
      <RegisterContent />
    </Suspense>
  );
}
