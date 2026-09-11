"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";
import { cn } from "@/lib/utils";
import { useAuthVisual } from "../auth-visual-context";
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

/**
 * Only allow same-origin relative paths; reject protocol-relative ("//evil.com") and
 * backslash tricks ("/\evil.com" — some browsers treat a leading backslash like "/").
 * This guard was already correct before the redesign — kept as-is (not weakened) per
 * docs/redesign/04-decisions.md 2026-09-10 "Phase 0 findings triage". Register's separate,
 * weaker guard is a different task (4.2), not this one.
 */
function safeRedirect(target: string | null): string | null {
  if (!target) return null;
  if (!target.startsWith("/")) return null;
  if (target.startsWith("//") || target.startsWith("/\\")) return null;
  return target;
}

function homeForRole(role: string): string {
  if (role === "ADMIN") return "/admin";
  if (role === "PARTNER") return "/partner";
  return "/";
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Reference schema for Phase 4 auth forms (react-hook-form + zodResolver, per
 * docs/redesign/04-decisions.md "Forms" decision). Phone/password are only checked for
 * presence here, matching today's documented parity exactly — login has never had a
 * client-side phone-format or password-length/complexity check (unlike register), so this
 * intentionally does not add one now. The account phone's *format* is validated against
 * whichever of the 22 dropdown countries was selected, but only server-side (lib/phone.ts's
 * normalizeAccountPhone) — see login.md's "Error state" notes.
 */
const loginFormSchema = z.object({
  countryCode: z.string().min(1),
  phone: z.string().trim().min(1, "أدخل رقم الجوال"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});
type LoginFormValues = z.infer<typeof loginFormSchema>;

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const { toast } = useToast();
  const router = useRouter();
  const { setVariant } = useAuthVisual();

  // The (auth) layout persists across sibling-route navigations (login/register/forgot-password
  // share one Next.js layout instance), so `AuthVisualProvider`'s hero-photography state can
  // otherwise leak in from forgot-password's "drape" step — assert this screen's own default on
  // mount rather than trusting the context's initial value.
  useEffect(() => {
    setVariant("weave");
  }, [setVariant]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { countryCode: DEFAULT_COUNTRY_CODE, phone: "", password: "" },
  });
  const loading = form.formState.isSubmitting;

  const onSubmit = async (values: LoginFormValues) => {
    const full = values.countryCode + digitsOnly(values.phone);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: full, password: values.password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast({
          title: data?.error?.message ?? "فشل تسجيل الدخول",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "تم تسجيل الدخول", variant: "success" });
      const explicit = safeRedirect(redirectTo);
      const role = data?.data?.role as string | undefined;
      router.push(explicit ?? homeForRole(role ?? "CUSTOMER"));
      router.refresh();
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  // Preserves the pre-redesign UX exactly: a required-field miss surfaces as the same
  // destructive toast as before (phone checked before password), not an inline red
  // border/helper text — see login.md's "Error state" ("no inline field-level error UI ...
  // only global toasts"). react-hook-form/Zod still drive validation itself; only the visual
  // surface for *these two* checks intentionally stays toast-only for parity. The design
  // canvas's screen 2b sketches a persistent inline error banner for wrong-credential
  // responses too, but that's intentionally NOT built here — see docs/redesign/04-decisions.md
  // 2026-09-11's error-architecture note confirming this toast-only pattern is tested parity
  // from the original app, not something this visual-refresh task should replace.
  const onInvalid = (errors: FieldErrors<LoginFormValues>) => {
    if (errors.phone) {
      toast({ title: errors.phone.message ?? "أدخل رقم الجوال", variant: "destructive" });
      return;
    }
    if (errors.password) {
      toast({ title: errors.password.message ?? "أدخل كلمة المرور", variant: "destructive" });
    }
  };

  return (
    <div className="w-full">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-6">
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
                {/* Product information, not decoration: the account model is WhatsApp-verified
                    numbers (art-direction brief §9/§19) — the same sentence on all three screens. */}
                <FormDescription className={authHelpClass}>
                  سيُرسل رمز التحقق عبر واتساب إلى هذا الرقم.
                </FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <FormLabel className={authLabelClass}>كلمة المرور</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="font-plex-arabic text-[13px] text-gold-600 underline-offset-4 hover:underline"
                  >
                    نسيت كلمة المرور؟
                  </Link>
                </div>
                <FormControl>
                  <PasswordFieldBox
                    placeholder="كلمة المرور"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <AuthDivider className="my-1" />

          <AuthSubmitButton disabled={loading}>
            {loading ? "جاري تسجيل الدخول…" : "تسجيل الدخول"}
          </AuthSubmitButton>
        </form>
      </Form>

      {/* One pattern at every breakpoint (brief §12): quiet lead-in, the action is the emphasis.
          The link carries its own vertical padding so it is a comfortable thumb target on phones. */}
      <p className="mt-7 font-plex-arabic text-[14px] text-[hsl(228_18%_40%)]">
        ليس لديك حساب؟{" "}
        <Link href="/register" className={cn(authInlineActionClass, "inline-block py-2 text-[15px]")}>
          إنشاء حساب
        </Link>
      </p>
    </div>
  );
}

export function LoginForm() {
  return (
    <Suspense
      fallback={<div className="h-80 w-full animate-pulse border border-[hsl(40_12%_80%)] bg-white/40" />}
    >
      <LoginContent />
    </Suspense>
  );
}
