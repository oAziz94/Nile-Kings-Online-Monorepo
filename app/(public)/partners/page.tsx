"use client";

/**
 * Backlog 4.14 — Become a partner. Editorial page per the shared "visual language, stated once"
 * paragraph in `03-backlog.md`'s second storefront batch (no separate Claude Design canvas for
 * this screen — the merged storefront code is the reference): papyrus ground, Amiri headings,
 * auth-style fields, hairline rules instead of cards, the PDP/cart ink-fill button pair.
 *
 * Parity preserved from `00-feature-inventory/public/become-a-partner.md`: the `?type=` query
 * contract (`distributor` -> DISTRIBUTOR, anything else -> AGENT) plus its `useEffect` re-sync on
 * back/forward navigation, the exact two request types (AGENT/DISTRIBUTOR), the six optional
 * social/link fields, the client presence-only validation on name/governorate/phone, the
 * `POST /api/partner-requests` payload shape, the in-flight field/button disabling, and every
 * server error surfacing (now also inline for the phone field — see below).
 *
 * Three PM-decided behaviour improvements (04-decisions.md 2026-09-12, "Second storefront
 * batch"), all client-only: (1) a server EGYPT_MOBILE_ERROR_MESSAGE rejection becomes the phone
 * field's inline error, not only a toast; (2) switching type while data is typed asks first via a
 * Dialog; (3) success is an in-page panel, not a toast that vanishes — no reference id, the API
 * returns none.
 */

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Disclosure } from "@/components/shared/disclosure";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { EGYPT_MOBILE_ERROR_MESSAGE } from "@/lib/phone";
import {
  authLabelClass,
  authFieldBoxClass,
  authBareInputClass,
  authBareSelectStyle,
} from "@/components/auth/auth-ui";
import { Facebook, Instagram, Youtube, Globe, Link2, Video, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type PartnerRegistrationType = "AGENT" | "DISTRIBUTOR";

/**
 * The two explainer lines under each option — must trace to the partner-portal inventories
 * (`00-feature-inventory/partner/*`), not be invented copy.
 *
 * Agent: "gives an AGENT a single read-only roster of every DISTRIBUTOR linked beneath them"
 * (distributors.md) + agent-held stock feeding downstream transfers (products.md's "authoritative
 * record of what they physically have on hand"; distributor-requests.md's stock moving out of
 * "the agent's `PartnerInventory`").
 * Distributor: "lets a DISTRIBUTOR request stock transfers from their linked AGENT" — the
 * restock-requests.md screen title itself, "distributor's request stock from my agent screen".
 */
const TYPE_OPTIONS: {
  id: PartnerRegistrationType;
  label: string;
  description: string;
}[] = [
  {
    id: "AGENT",
    label: "وكيل أونلاين",
    description: "الوكيل يحتفظ بالمخزون ويشرف على الموزعين المرتبطين بحسابه.",
  },
  {
    id: "DISTRIBUTOR",
    label: "موزع أونلاين",
    description: "الموزع يبيع من مخزون الوكيل الخاص به ويطلب منه إعادة التوريد عند الحاجة.",
  },
];

const FORM_TITLES: Record<PartnerRegistrationType, string> = {
  AGENT: "طلب تسجيل وكيل أونلاين",
  DISTRIBUTOR: "طلب تسجيل موزع أونلاين",
};

type FormState = {
  name: string;
  governorate: string;
  phone: string;
  facebookUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  youtubeUrl: string;
  websiteUrl: string;
  otherUrl: string;
};

const initialForm: FormState = {
  name: "",
  governorate: "",
  phone: "",
  facebookUrl: "",
  instagramUrl: "",
  tiktokUrl: "",
  youtubeUrl: "",
  websiteUrl: "",
  otherUrl: "",
};

function hasTypedData(form: FormState): boolean {
  return Object.values(form).some((v) => v.trim().length > 0);
}

function sanitize(str: string, maxLen: number): string {
  return str.trim().slice(0, maxLen);
}

const SOCIAL_FIELDS: { key: keyof FormState; label: string; icon: React.ReactNode }[] = [
  { key: "facebookUrl", label: "فيسبوك", icon: <Facebook className="h-4 w-4" /> },
  { key: "instagramUrl", label: "إنستجرام", icon: <Instagram className="h-4 w-4" /> },
  { key: "tiktokUrl", label: "تيك توك", icon: <Video className="h-4 w-4" /> },
  { key: "youtubeUrl", label: "يوتيوب", icon: <Youtube className="h-4 w-4" /> },
  { key: "websiteUrl", label: "رابط الموقع", icon: <Globe className="h-4 w-4" /> },
  { key: "otherUrl", label: "رابط آخر", icon: <Link2 className="h-4 w-4" /> },
];

/** Header — identical in the Suspense fallback and the loaded state (parity). */
function PageHeader() {
  return (
    <div className="mb-8 max-w-2xl md:mb-10">
      <h1 className="font-amiri text-[34px] font-bold leading-tight text-[hsl(228_40%_14%)] md:text-[44px]">
        شركاؤنا
      </h1>
      <p className="mt-3 text-[15px] leading-7 text-[hsl(228_26%_24%)] md:text-base">
        أهلًا بك فى عالم شركاء ملوك النيل — اختر نوع التسجيل وأكمل البيانات وسنتواصل معك قريباً.
      </p>
    </div>
  );
}

function PartnersPageFallback() {
  return (
    <div className="container px-4 py-6 md:py-8" dir="rtl">
      <PageHeader />
      <div className="flex flex-col gap-3 sm:flex-row" aria-hidden="true">
        <div className="h-[92px] flex-1 border border-[hsl(228_16%_84%)]" />
        <div className="h-[92px] flex-1 border border-[hsl(228_16%_84%)]" />
      </div>
      <div className="mt-8 h-[320px] w-full max-w-xl animate-pulse bg-[hsl(38_22%_93%)]" />
    </div>
  );
}

function PartnersPageContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const initialType: PartnerRegistrationType = typeParam === "distributor" ? "DISTRIBUTOR" : "AGENT";

  const { toast } = useToast();
  const [type, setType] = React.useState<PartnerRegistrationType>(initialType);
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [pendingType, setPendingType] = React.useState<PartnerRegistrationType | null>(null);

  // Back/forward navigation changing `?type=` re-syncs the tab directly — this is the existing
  // URL contract (become-a-partner.md), not a user click on the radiogroup, so it stays a full
  // reset with no confirmation dialog (that gate only applies to the in-page control below).
  React.useEffect(() => {
    const next: PartnerRegistrationType = typeParam === "distributor" ? "DISTRIBUTOR" : "AGENT";
    setType(next);
    setForm(initialForm);
    setErrors({});
    setServerError(null);
  }, [typeParam]);

  function applyTypeChange(next: PartnerRegistrationType) {
    setType(next);
    setForm(initialForm);
    setErrors({});
    setServerError(null);
  }

  const typeRefs = React.useRef<Record<string, HTMLButtonElement | null>>({});

  function requestTypeChange(next: PartnerRegistrationType) {
    if (next === type) return;
    if (hasTypedData(form)) {
      setPendingType(next);
      return;
    }
    applyTypeChange(next);
  }

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = "الاسم مطلوب";
    if (!form.governorate.trim()) e.governorate = "المحافظة مطلوبة";
    if (!form.phone.trim()) e.phone = "رقم التليفون مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    if (!validate() || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/partner-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: type,
          name: sanitize(form.name, 200),
          governorate: sanitize(form.governorate, 100),
          phone: sanitize(form.phone, 30),
          facebookUrl: form.facebookUrl.trim() || null,
          instagramUrl: form.instagramUrl.trim() || null,
          tiktokUrl: form.tiktokUrl.trim() || null,
          youtubeUrl: form.youtubeUrl.trim() || null,
          websiteUrl: form.websiteUrl.trim() || null,
          otherUrl: form.otherUrl.trim() || null,
        }),
      });
      const json = await res.json();

      if (json?.success) {
        setSuccessMessage(json?.message ?? "سنتواصل معك قريباً");
        setForm(initialForm);
        setErrors({});
        return;
      }

      const msg: string = json?.error?.message ?? "حدث خطأ، يرجى المحاولة لاحقاً";
      if (msg === EGYPT_MOBILE_ERROR_MESSAGE) {
        setErrors((prev) => ({ ...prev, phone: msg }));
      } else {
        setServerError(msg);
      }
      toast({ title: "فشل الإرسال", description: msg, variant: "destructive" });
    } catch {
      const msg = "حدث خطأ في الاتصال";
      setServerError(msg);
      toast({ title: "فشل الإرسال", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div className="container px-4 py-6 md:py-8" dir="rtl">
        <PageHeader />
        <div className="max-w-xl border-s-4 border-gold-500 bg-[hsl(38_22%_96%)] p-6 md:p-8">
          <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">تم استلام طلبك</h2>
          <p className="mt-3 text-[15px] leading-7 text-[hsl(228_26%_24%)]">{successMessage}</p>
          <Button
            type="button"
            className="mt-6 h-14 rounded-none bg-[hsl(228_40%_14%)] px-8 text-papyrus hover:bg-[hsl(228_40%_20%)]"
            onClick={() => setSuccessMessage(null)}
          >
            إرسال طلب آخر
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container px-4 py-6 md:py-8" dir="rtl">
      <PageHeader />

      <div
        role="radiogroup"
        aria-label="نوع التسجيل"
        className="grid gap-3 sm:grid-cols-2"
      >
        {TYPE_OPTIONS.map((opt, index) => {
          const selected = type === opt.id;
          return (
            <button
              key={opt.id}
              ref={(el) => {
                typeRefs.current[opt.id] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              // ARIA radiogroup pattern, same as `components/shared/size-chips.tsx`: one roving tab
              // stop (the checked option) and Arrow keys move to — and choose — the other option.
              // Choosing goes through `requestTypeChange`, so the discard confirmation still applies.
              tabIndex={selected ? 0 : -1}
              onClick={() => requestTypeChange(opt.id)}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
                e.preventDefault();
                const dir = e.key === "ArrowLeft" || e.key === "ArrowUp" ? 1 : -1;
                const next = TYPE_OPTIONS[(index + dir + TYPE_OPTIONS.length) % TYPE_OPTIONS.length];
                typeRefs.current[next.id]?.focus();
                requestTypeChange(next.id);
              }}
              disabled={loading}
              className={cn(
                "flex flex-col gap-1.5 border px-5 py-4 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 focus-visible:ring-offset-papyrus",
                "border-[hsl(228_40%_14%)]/30 bg-transparent",
                selected && "border-[hsl(228_40%_14%)] bg-[hsl(228_40%_14%)]/[0.04]"
              )}
            >
              <span className="flex items-center gap-2.5 font-plex-arabic text-[15px] font-semibold text-[hsl(228_40%_14%)]">
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                    selected ? "border-[hsl(228_40%_14%)]" : "border-[hsl(228_16%_60%)]"
                  )}
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-gold-500" />}
                </span>
                {opt.label}
              </span>
              <span className="text-[13px] leading-6 text-[hsl(228_18%_45%)]">{opt.description}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="mt-8 flex max-w-xl flex-col gap-6" noValidate>
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">{FORM_TITLES[type]}</h2>

        <div className="space-y-2.5">
          <label htmlFor="partner-name" className={authLabelClass}>
            الاسم
          </label>
          <div className={authFieldBoxClass(!!errors.name)}>
            <input
              id="partner-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="الاسم الكامل"
              className={authBareInputClass}
              maxLength={200}
              disabled={loading}
              autoComplete="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "partner-name-error" : undefined}
            />
          </div>
          {errors.name && (
            <p id="partner-name-error" className="text-sm text-destructive">
              {errors.name}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <label htmlFor="partner-governorate" className={authLabelClass}>
            المحافظة
          </label>
          <div className={authFieldBoxClass(!!errors.governorate)}>
            <select
              id="partner-governorate"
              value={form.governorate}
              onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))}
              className="h-full w-full cursor-pointer appearance-none rounded-none border-0 bg-transparent bg-[position:left_16px_center] bg-no-repeat px-4 text-right font-plex-arabic text-[15px] text-[hsl(228_40%_14%)] focus-visible:outline-none"
              style={authBareSelectStyle}
              disabled={loading}
              aria-invalid={!!errors.governorate}
              aria-describedby={errors.governorate ? "partner-governorate-error" : undefined}
            >
              <option value="">اختر المحافظة</option>
              {GOVERNORATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {errors.governorate && (
            <p id="partner-governorate-error" className="text-sm text-destructive">
              {errors.governorate}
            </p>
          )}
        </div>

        <div className="space-y-2.5">
          <label htmlFor="partner-phone" className={authLabelClass}>
            رقم التليفون
          </label>
          <div className={authFieldBoxClass(!!errors.phone)}>
            <input
              id="partner-phone"
              type="tel"
              dir="ltr"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="01xxxxxxxxx"
              className={authBareInputClass}
              maxLength={30}
              disabled={loading}
              autoComplete="tel"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "partner-phone-error" : undefined}
            />
          </div>
          {errors.phone && (
            <p id="partner-phone-error" className="text-sm text-destructive">
              {errors.phone}
            </p>
          )}
        </div>

        <Disclosure title="روابط التواصل (اختياري)">
          <div className="flex flex-col gap-4">
            {SOCIAL_FIELDS.map(({ key, label, icon }) => (
              <div key={key} className="space-y-2">
                <label htmlFor={`partner-${key}`} className={authLabelClass}>
                  {label}
                </label>
                <div className={cn(authFieldBoxClass(), "items-center gap-2 px-4")}>
                  <span aria-hidden="true" className="shrink-0 text-[hsl(228_18%_50%)]">
                    {icon}
                  </span>
                  <input
                    id={`partner-${key}`}
                    type="url"
                    dir="ltr"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder="https://"
                    className={cn(authBareInputClass, "px-0 text-right")}
                    maxLength={500}
                    disabled={loading}
                  />
                </div>
              </div>
            ))}
          </div>
        </Disclosure>

        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}

        <p className="text-[13px] leading-6 text-[hsl(228_18%_45%)]">
          بإرسال الطلب أنت توافق على{" "}
          <Link href="/terms" className="border-b border-gold-500 text-[hsl(228_40%_14%)]">
            الشروط والأحكام
          </Link>{" "}
          و
          <Link href="/privacy" className="border-b border-gold-500 text-[hsl(228_40%_14%)]">
            سياسة الخصوصية
          </Link>
        </p>

        <Button
          type="submit"
          disabled={loading}
          className="h-14 w-full rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)] sm:w-auto sm:min-w-[220px]"
        >
          {loading ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              جاري الإرسال...
            </>
          ) : (
            "إرسال الطلب"
          )}
        </Button>
      </form>

      <Dialog open={pendingType !== null} onOpenChange={(open) => !open && setPendingType(null)}>
        <DialogContent className="max-w-sm rounded-none border border-[hsl(228_16%_84%)] bg-papyrus">
          <DialogTitle className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)]">
            سيتم مسح البيانات المكتوبة
          </DialogTitle>
          <DialogDescription className="text-[hsl(228_18%_45%)]">متابعة؟</DialogDescription>
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
              onClick={() => setPendingType(null)}
            >
              تراجع
            </Button>
            <Button
              type="button"
              className="h-12 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
              onClick={() => {
                if (pendingType) applyTypeChange(pendingType);
                setPendingType(null);
              }}
            >
              متابعة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PartnersPage() {
  return (
    <React.Suspense fallback={<PartnersPageFallback />}>
      <PartnersPageContent />
    </React.Suspense>
  );
}
