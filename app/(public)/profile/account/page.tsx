"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type SubmitErrorHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Skeleton } from "@/components/shared/skeleton";
import { useToast } from "@/hooks/use-toast";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

// Backlog 6.2 — design tokens lifted verbatim from design-canvas/account/build.mjs's `T`/`CSS`
// (never approximated to the shared `gold-500`/`ink` Tailwind tokens, which are calibrated to a
// slightly different shade than the account canvas).
const INK = "#151A35";
const INK_60 = "rgba(21,26,53,.6)";
const INK_80 = "rgba(21,26,53,.8)";
const MUTED = "#8A8C9A";
const RULE = "rgba(21,26,53,.16)";
const RULE_SOFT = "rgba(21,26,53,.09)";
const CARN = "#A83A2A";
const SAND_SOFT = "#EFEAE0";

type AccountResponse = {
  phone: string;
  name: string | null;
  email: string | null;
  seniorVerified: boolean;
  nationalIdLast4: string | null;
  createdAt: string;
  updatedAt: string;
  orderCount: number;
};

// ---- icons (21-grid, stroke 1.3 — the same hand-drawn language as the navbar/rail icons) ----
const iconProps = {
  viewBox: "0 0 21 21",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.3,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

function MailIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4 shrink-0">
      <rect x="3" y="5.5" width="15" height="10" />
      <path d="M3 6.5l7.5 5.5L18 6.5" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4 shrink-0">
      <rect x="5" y="9" width="11" height="8.5" />
      <path d="M7.5 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg {...iconProps} className="h-4 w-4 shrink-0">
      <path d="M8 17.5H4.5v-14H8" />
      <path d="M13 14l3.5-3.5L13 7M16.5 10.5H8" />
    </svg>
  );
}
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg {...iconProps} className="h-[18px] w-[18px] shrink-0">
      <path d="M2.5 10.5S5.5 5.5 10.5 5.5s8 5 8 5-3 5-8 5-8-5-8-5z" />
      <circle cx="10.5" cy="10.5" r="2.2" />
      {!open && <path d="M4.2 16.8L16.8 4.2" />}
    </svg>
  );
}

// ---- field shell + input box (canvas's `.field`/`.input` classes) ----
function fieldBoxClass(hasError?: boolean) {
  return cn(
    "flex h-12 items-center gap-2.5 border bg-white px-3.5 transition-[border-color,box-shadow]",
    hasError
      ? "border-[#A83A2A]"
      : "border-[rgba(21,26,53,.16)] focus-within:border-[#B8902F] focus-within:shadow-[0_0_0_2px_rgba(184,144,47,.14)]"
  );
}
const bareInputClass =
  "h-full w-0 min-w-0 flex-1 border-0 bg-transparent font-plex-arabic text-[15px] text-[#151A35] outline-none placeholder:text-[#8A8C9A]";

function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  span,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", span && "lg:col-span-2")}>
      <label htmlFor={htmlFor} className="font-plex-arabic text-[13px] font-medium" style={{ color: INK_80 }}>
        {label}
      </label>
      {children}
      {error ? (
        <span role="alert" className="font-plex-arabic text-[12.5px]" style={{ color: CARN }}>
          {error}
        </span>
      ) : hint ? (
        <span className="font-plex-arabic text-[12px]" style={{ color: MUTED }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

function SectionHeading({ title, hint, id }: { title: string; hint: string; id: string }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="font-amiri text-[22px] font-bold lg:text-[26px]" style={{ color: INK }}>
        {title}
      </h2>
      <p className="mt-1 font-plex-arabic text-[13.5px]" style={{ color: MUTED }}>
        {hint}
      </p>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل بيانات الحساب" className="flex flex-col gap-9">
      <div>
        <Skeleton className="h-7 w-32" />
        <Skeleton className="mt-2 h-4 w-72" />
        <div className="mt-5 flex flex-col gap-5 border p-6 lg:grid lg:grid-cols-2 lg:gap-6" style={{ borderColor: RULE }}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-5 flex flex-col gap-5 border p-6 lg:grid lg:grid-cols-2 lg:gap-6" style={{ borderColor: RULE }}>
          <Skeleton className="h-12 w-full lg:col-span-2" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

// ---- validation: the inventory's exact client rules + messages (profile-account.md) ----
const NAME_MIN_MSG = "الاسم مطلوب (حرفان على الأقل)";
const PASSWORD_ALL_REQUIRED_MSG = "أدخل كلمة المرور الحالية والجديدة وتأكيدها";
const PASSWORD_MIN_MSG = "كلمة المرور الجديدة مطلوبة (8 أحرف على الأقل)";
const PASSWORD_MISMATCH_MSG = "تأكيد كلمة المرور الجديدة غير مطابق";

const infoSchema = z.object({ name: z.string(), email: z.string() }).superRefine((data, ctx) => {
  if (data.name.trim().length < 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NAME_MIN_MSG, path: ["name"] });
  }
});
type InfoValues = z.infer<typeof infoSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string(),
    newPasswordConfirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.currentPassword || !data.newPassword || !data.newPasswordConfirm) {
      if (!data.currentPassword)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PASSWORD_ALL_REQUIRED_MSG, path: ["currentPassword"] });
      if (!data.newPassword)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PASSWORD_ALL_REQUIRED_MSG, path: ["newPassword"] });
      if (!data.newPasswordConfirm)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: PASSWORD_ALL_REQUIRED_MSG, path: ["newPasswordConfirm"] });
      return;
    }
    if (data.newPassword.length < 8) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PASSWORD_MIN_MSG, path: ["newPassword"] });
      return;
    }
    if (data.newPassword !== data.newPasswordConfirm) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PASSWORD_MISMATCH_MSG, path: ["newPasswordConfirm"] });
    }
  });
type PasswordValues = z.infer<typeof passwordSchema>;

export default function ProfileAccountPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = React.useState(true);
  const [profilePhone, setProfilePhone] = React.useState("");
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const infoForm = useForm<InfoValues>({
    resolver: zodResolver(infoSchema),
    defaultValues: { name: "", email: "" },
  });
  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "", newPasswordConfirm: "" },
  });

  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/profile/account", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/account");
          return null;
        }
        return parseJsonResponse<{ success?: boolean; data?: AccountResponse; error?: { message?: string } }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          setProfilePhone(json.data.phone ?? "");
          setUpdatedAt(json.data.updatedAt ?? null);
          infoForm.reset({ name: json.data.name ?? "", email: json.data.email ?? "" });
        }
      })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
    // Loads once on mount — same as before the redesign.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onInfoInvalid: SubmitErrorHandler<InfoValues> = (errors) => {
    const first = Object.values(errors)[0] as { message?: string } | undefined;
    if (first?.message) toast({ title: first.message, variant: "destructive" });
  };

  const onInfoSubmit = async (data: InfoValues) => {
    const trimmedName = data.name.trim();
    const trimmedEmail = data.email.trim();
    try {
      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail ? trimmedEmail : null,
        }),
      });

      if (res.status === 401) {
        router.replace("/login?redirect=/profile/account");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; data?: AccountResponse; error?: { message?: string } }>(
        res
      );
      if (res.ok && json?.success) {
        toast({ title: "تم تحديث بيانات الحساب" });
        if (json.data?.updatedAt) setUpdatedAt(json.data.updatedAt);
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  const onPasswordInvalid: SubmitErrorHandler<PasswordValues> = (errors) => {
    const first = Object.values(errors)[0] as { message?: string } | undefined;
    if (first?.message) toast({ title: first.message, variant: "destructive" });
  };

  const onPasswordSubmit = async (data: PasswordValues) => {
    try {
      const res = await fetch("/api/profile/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          newPasswordConfirm: data.newPasswordConfirm,
        }),
      });

      if (res.status === 401) {
        router.replace("/login?redirect=/profile/account");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
      if (res.ok && json?.success) {
        toast({ title: "تم تغيير كلمة المرور بنجاح" });
        passwordForm.reset({ currentPassword: "", newPassword: "", newPasswordConfirm: "" });
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      router.refresh();
      router.push("/");
    }
  };

  if (loading) {
    return <AccountSkeleton />;
  }

  const infoErrors = infoForm.formState.errors;
  const passwordErrors = passwordForm.formState.errors;

  return (
    <div className="flex flex-col gap-9">
      {/* بيانات الحساب */}
      <section aria-labelledby="account-info-heading">
        <SectionHeading
          id="account-info-heading"
          title="حسابي"
          hint="الاسم والبريد قابلان للتعديل. رقم الجوال هو هوية حسابك ولا يتغير من هنا."
        />

        <form onSubmit={infoForm.handleSubmit(onInfoSubmit, onInfoInvalid)} noValidate>
          <div className="border p-5 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5 lg:p-8" style={{ borderColor: RULE, backgroundColor: "#FFFDFA" }}>
            <div className="mb-5 lg:mb-0">
              <FieldShell label="الاسم" htmlFor="account-name" error={infoErrors.name?.message}>
                <div className={fieldBoxClass(!!infoErrors.name)}>
                  <input
                    id="account-name"
                    placeholder="اكتب اسمك"
                    className={bareInputClass}
                    {...infoForm.register("name")}
                  />
                </div>
              </FieldShell>
            </div>

            <div className="mb-5 lg:mb-0">
              <FieldShell
                label="البريد الإلكتروني (اختياري)"
                htmlFor="account-email"
                hint="نستخدمه لإشعارات الطلب فقط."
              >
                <div className={fieldBoxClass()}>
                  <MailIcon />
                  <input
                    id="account-email"
                    type="email"
                    inputMode="email"
                    dir="ltr"
                    placeholder="name@example.com"
                    className={cn(bareInputClass, "text-left font-archivo")}
                    {...infoForm.register("email")}
                  />
                </div>
              </FieldShell>
            </div>

            <FieldShell
              label="رقم الجوال"
              htmlFor="account-phone"
              hint="موثّق عبر واتساب. للتغيير تواصل مع خدمة العملاء."
            >
              <div className={fieldBoxClass()} style={{ backgroundColor: SAND_SOFT }}>
                <LockIcon />
                <input
                  id="account-phone"
                  value={profilePhone}
                  disabled
                  dir="ltr"
                  className={cn(bareInputClass, "cursor-not-allowed font-archivo text-left")}
                  style={{ backgroundColor: "transparent", color: INK_60 }}
                />
              </div>
            </FieldShell>

            <div className="mt-6 flex flex-wrap items-center gap-3.5 border-t pt-5 lg:col-span-2" style={{ borderColor: RULE_SOFT }}>
              <button
                type="submit"
                disabled={infoForm.formState.isSubmitting}
                className="inline-flex h-12 items-center justify-center px-6 font-plex-arabic text-[14px] font-medium text-[#F7F4EE] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                style={{ backgroundColor: INK }}
              >
                {infoForm.formState.isSubmitting ? "جاري الحفظ…" : "حفظ التعديلات"}
              </button>
              {updatedAt && (
                <span className="font-plex-arabic text-[13px]" style={{ color: MUTED }}>
                  آخر تحديث {formatDateEn(updatedAt)}
                </span>
              )}
            </div>
          </div>
        </form>
      </section>

      {/* كلمة المرور */}
      <section aria-labelledby="account-password-heading">
        <SectionHeading
          id="account-password-heading"
          title="كلمة المرور"
          hint="غيّر كلمة المرور من هنا. نسيتها؟ استخدم صفحة استعادة كلمة المرور بعد تسجيل الخروج."
        />

        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit, onPasswordInvalid)} noValidate>
          <div className="border p-5 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5 lg:p-8" style={{ borderColor: RULE, backgroundColor: "#FFFDFA" }}>
            <div className="mb-5 lg:col-span-2 lg:mb-0">
              <FieldShell
                label="كلمة المرور الحالية"
                htmlFor="current-password"
                error={passwordErrors.currentPassword?.message}
                span
              >
                <div className={fieldBoxClass(!!passwordErrors.currentPassword)}>
                  <input
                    id="current-password"
                    type={showCurrent ? "text" : "password"}
                    dir="ltr"
                    autoComplete="current-password"
                    className={cn(bareInputClass, "text-left font-archivo")}
                    {...passwordForm.register("currentPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((s) => !s)}
                    aria-pressed={showCurrent}
                    aria-label={showCurrent ? "إخفاء قيمة الحقل المُدخلة" : "إظهار قيمة الحقل المُدخلة"}
                    className="grid h-8 w-8 shrink-0 place-items-center text-[#8A8C9A] hover:text-[#151A35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8902F]"
                  >
                    <EyeIcon open={showCurrent} />
                  </button>
                </div>
              </FieldShell>
            </div>

            <div className="mb-5 lg:mb-0">
              <FieldShell
                label="كلمة المرور الجديدة"
                htmlFor="new-password"
                error={passwordErrors.newPassword?.message}
                hint={passwordErrors.newPassword?.message ? undefined : "8 أحرف على الأقل."}
              >
                <div className={fieldBoxClass(!!passwordErrors.newPassword)}>
                  <input
                    id="new-password"
                    type={showNew ? "text" : "password"}
                    dir="ltr"
                    autoComplete="new-password"
                    className={cn(bareInputClass, "text-left font-archivo")}
                    {...passwordForm.register("newPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((s) => !s)}
                    aria-pressed={showNew}
                    aria-label={showNew ? "إخفاء قيمة الحقل المُدخلة" : "إظهار قيمة الحقل المُدخلة"}
                    className="grid h-8 w-8 shrink-0 place-items-center text-[#8A8C9A] hover:text-[#151A35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8902F]"
                  >
                    <EyeIcon open={showNew} />
                  </button>
                </div>
              </FieldShell>
            </div>

            <div className="mb-1 lg:mb-0">
              <FieldShell
                label="تأكيد كلمة المرور الجديدة"
                htmlFor="new-password-confirm"
                error={passwordErrors.newPasswordConfirm?.message}
              >
                <div className={fieldBoxClass(!!passwordErrors.newPasswordConfirm)}>
                  <input
                    id="new-password-confirm"
                    type={showConfirm ? "text" : "password"}
                    dir="ltr"
                    autoComplete="new-password"
                    className={cn(bareInputClass, "text-left font-archivo")}
                    {...passwordForm.register("newPasswordConfirm")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((s) => !s)}
                    aria-pressed={showConfirm}
                    aria-label={showConfirm ? "إخفاء قيمة الحقل المُدخلة" : "إظهار قيمة الحقل المُدخلة"}
                    className="grid h-8 w-8 shrink-0 place-items-center text-[#8A8C9A] hover:text-[#151A35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#B8902F]"
                  >
                    <EyeIcon open={showConfirm} />
                  </button>
                </div>
              </FieldShell>
            </div>

            <div className="mt-6 border-t pt-5 lg:col-span-2" style={{ borderColor: RULE_SOFT }}>
              <button
                type="submit"
                disabled={passwordForm.formState.isSubmitting}
                className="inline-flex h-12 items-center justify-center border px-6 font-plex-arabic text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderColor: INK, color: INK }}
              >
                {passwordForm.formState.isSubmitting ? "جاري التغيير…" : "تغيير كلمة المرور"}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* تسجيل الخروج */}
      <div
        className="flex flex-wrap items-center justify-between gap-4 border p-5 lg:p-6"
        style={{ borderColor: RULE_SOFT }}
      >
        <div>
          <p className="font-plex-arabic text-[15px] font-medium" style={{ color: INK }}>
            تسجيل الخروج من هذا الجهاز
          </p>
          <p className="mt-0.5 font-plex-arabic text-[13px]" style={{ color: MUTED }}>
            سلة التسوق تبقى محفوظة في حسابك.
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex h-10 items-center gap-2 border px-4 font-plex-arabic text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ borderColor: RULE, color: INK }}
        >
          <LogoutIcon />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
