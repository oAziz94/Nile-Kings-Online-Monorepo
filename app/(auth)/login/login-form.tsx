"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from "@/lib/country-codes";

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
  // surface for *these two* checks intentionally stays toast-only for parity.
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
    <div className="w-full rounded-2xl border border-border bg-card p-6 shadow-card">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
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
                    dir="ltr"
                    aria-label="رمز الدولة"
                    className="min-w-[7rem] flex-none cursor-pointer"
                  >
                    {COUNTRY_CODES.map(({ code, country }) => (
                      <option key={code} value={code}>
                        {code} {country}
                      </option>
                    ))}
                  </Select>
                </div>
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
                    placeholder="كلمة المرور"
                    autoComplete="current-password"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <p className="-mt-2 text-left text-sm">
            <Link
              href="/forgot-password"
              className="font-semibold text-primary underline hover:no-underline"
            >
              نسيت كلمة المرور؟
            </Link>
          </p>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "جاري تسجيل الدخول…" : "تسجيل الدخول"}
          </Button>
        </form>
      </Form>

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

export function LoginForm() {
  return (
    <Suspense
      fallback={
        <div className="h-80 w-full animate-pulse rounded-2xl border border-border bg-card p-6 shadow-card" />
      }
    >
      <LoginContent />
    </Suspense>
  );
}
