"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import {
  Facebook,
  Instagram,
  Youtube,
  Globe,
  Link2,
  Video,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PartnerRegistrationType = "AGENT" | "DISTRIBUTOR";

const MODAL_TITLES: Record<PartnerRegistrationType, { welcome: string; sub: string; formTitle: string }> = {
  AGENT: {
    welcome: "أهلًا بك فى عالم شركاء ملوك النيل",
    sub: "NILE KINGS PARTNER'S",
    formTitle: "طلب تسجيل وكيل أونلاين",
  },
  DISTRIBUTOR: {
    welcome: "أهلًا بك فى عالم شركاء ملوك النيل",
    sub: "NILE KINGS PARTNER'S",
    formTitle: "طلب تسجيل موزع أونلاين",
  },
};

const SOCIAL_FIELDS: { key: keyof FormState; label: string; icon: React.ReactNode; placeholder?: string }[] = [
  { key: "facebookUrl", label: "Facebook", icon: <Facebook className="h-4 w-4" /> },
  { key: "instagramUrl", label: "Instagram", icon: <Instagram className="h-4 w-4" /> },
  { key: "tiktokUrl", label: "TikTok", icon: <Video className="h-4 w-4" /> },
  { key: "youtubeUrl", label: "YouTube", icon: <Youtube className="h-4 w-4" /> },
  { key: "websiteUrl", label: "Website", icon: <Globe className="h-4 w-4" />, placeholder: "رابط الموقع" },
  { key: "otherUrl", label: "Other", icon: <Link2 className="h-4 w-4" />, placeholder: "رابط آخر" },
];

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

function sanitize(str: string, maxLen: number): string {
  return str.trim().slice(0, maxLen);
}

export interface PartnerRegistrationModalProps {
  type: PartnerRegistrationType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PartnerRegistrationModal({
  type,
  open,
  onOpenChange,
}: PartnerRegistrationModalProps) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<FormState>(initialForm);
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});

  const titles = MODAL_TITLES[type];

  React.useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setErrors({});
    }
  }, [open]);

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
        toast({
          title: "تم الإرسال بنجاح",
          description: json?.message ?? "سنتواصل معك قريباً",
        });
        onOpenChange(false);
        return;
      }
      const msg = json?.error?.message ?? "حدث خطأ، يرجى المحاولة لاحقاً";
      toast({ title: "فشل الإرسال", description: msg, variant: "destructive" });
    } catch {
      toast({
        title: "فشل الإرسال",
        description: "حدث خطأ في الاتصال",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOverlayClick={!loading}>
      <DialogContent
        className="max-w-md rounded-2xl border border-border bg-card shadow-lg p-0 overflow-hidden"
        dir="rtl"
        onClose={() => !loading && onOpenChange(false)}
      >
        <div className="flex items-start justify-between gap-4 p-6 pb-0">
          <DialogHeader className="space-y-1 text-right">
            <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {titles.sub}
            </p>
            <DialogTitle className="text-xl font-bold text-foreground">
              {titles.welcome}
            </DialogTitle>
            <p className="text-base text-muted-foreground">{titles.formTitle}</p>
          </DialogHeader>
          <DialogClose
            className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            disabled={loading}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </DialogClose>
        </div>

        <form onSubmit={handleSubmit} className="p-6 pt-4 space-y-4">
          <div>
            <label htmlFor="partner-name" className="mb-1 block text-sm font-medium text-foreground">
              الاسم <span className="text-destructive">*</span>
            </label>
            <Input
              id="partner-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="الاسم الكامل"
              className={cn(errors.name && "border-destructive")}
              maxLength={200}
              disabled={loading}
              autoComplete="name"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div>
            <label htmlFor="partner-governorate" className="mb-1 block text-sm font-medium text-foreground">
              المحافظة <span className="text-destructive">*</span>
            </label>
            <select
              id="partner-governorate"
              value={form.governorate}
              onChange={(e) => setForm((f) => ({ ...f, governorate: e.target.value }))}
              className={cn(
                "flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                errors.governorate && "border-destructive"
              )}
              disabled={loading}
            >
              <option value="">اختر المحافظة</option>
              {GOVERNORATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {errors.governorate && (
              <p className="mt-1 text-sm text-destructive">{errors.governorate}</p>
            )}
          </div>

          <div>
            <label htmlFor="partner-phone" className="mb-1 block text-sm font-medium text-foreground">
              رقم التليفون <span className="text-destructive">*</span>
            </label>
            <Input
              id="partner-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="رقم التليفون"
              className={cn(errors.phone && "border-destructive")}
              maxLength={30}
              disabled={loading}
              autoComplete="tel"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-destructive">{errors.phone}</p>
            )}
          </div>

          <div className="pt-2 border-t border-border">
            <p className="mb-3 text-sm font-medium text-muted-foreground">
              روابط السوشيال ميديا (اختياري)
            </p>
            <div className="space-y-3">
              {SOCIAL_FIELDS.map(({ key, label, icon, placeholder }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 text-muted-foreground">
                    {icon}
                  </span>
                  <Input
                    type="url"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder ?? label}
                    className="flex-1"
                    maxLength={500}
                    disabled={loading}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  جاري الإرسال...
                </>
              ) : (
                "إرسال الطلب"
              )}
            </Button>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={loading}>
                إلغاء
              </Button>
            </DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
