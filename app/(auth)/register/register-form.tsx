"use client";

import { Suspense, useState } from "react";
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

const MIN_PASSWORD_LEN = 8;

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

type Step = "phone" | "profile";

/**
 * Single schema for both steps (react-hook-form + zodResolver, per
 * docs/redesign/04-decisions.md "Forms" decision). The "phone" step only ever validates the
 * `phone` field on its own (via `form.trigger("phone")`) — matching register.md exactly:
 * "No server call and no phone-format validation happens at this step ... otherwise
 * setStep('profile')". Real phone-format validation (against whichever of the 22 dropdown
 * countries was selected) only happens server-side at final submit, same as before.
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

  const handleContinue = async () => {
    const valid = await form.trigger("phone");
    if (!valid) {
      toast({
        title: form.formState.errors.phone?.message ?? "أدخل رقم الجوال",
        variant: "destructive",
      });
      return;
    }
    setStep("profile");
  };

  const onSubmit = async (values: RegisterFormValues) => {
    const full = values.countryCode + digitsOnly(values.phone);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: full,
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
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full">
              متابعة
            </Button>
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
              onClick={() => setStep("phone")}
            >
              تغيير الرقم
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
