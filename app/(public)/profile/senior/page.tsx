"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Skeleton } from "@/components/shared/skeleton";
import { useToast } from "@/hooks/use-toast";
import { authLabelClass, authHelpClass, authFieldBoxClass, authBareInputClass, AuthSubmitButton } from "@/components/auth/auth-ui";

type SeniorStatus = {
  seniorVerified: boolean;
  nationalIdLast4: string | null;
};

function SeniorSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل حالة العرض الخاص" className="mt-6 flex max-w-md flex-col gap-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="mt-4 h-14 w-full" />
      <Skeleton className="h-14 w-40" />
    </div>
  );
}

export default function ProfileSeniorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = React.useState<SeniorStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nationalId, setNationalId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [promoEnabled, setPromoEnabled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    fetch("/api/profile/senior", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/senior");
          return null;
        }
        return res.json();
      })
      .then((json: { success?: boolean; data?: SeniorStatus }) => {
        if (json?.success && json.data) {
          setStatus(json.data);
        }
      })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [router, toast]);

  React.useEffect(() => {
    fetch("/api/settings/senior-promo")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { success?: boolean; data?: { enabled: boolean } } | null) => {
        if (json?.success && json.data) setPromoEnabled(json.data.enabled);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/profile/senior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId: nationalId.trim() }),
        credentials: "include",
      });
      const json = await res.json();
      if (res.status === 401) {
        router.replace("/login?redirect=/profile/senior");
        return;
      }
      if (res.ok && json?.success && json?.data) {
        setStatus({ seniorVerified: true, nationalIdLast4: json.data.nationalIdLast4 ?? null });
        setNationalId("");
        toast({ title: "تم التحقق بنجاح. يمكنك الاستفادة من العرض الخاص." });
      } else {
        toast({ title: json?.error?.message ?? "فشل التحقق", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">العرض الخاص</h2>
        <SeniorSkeleton />
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">العرض الخاص</h2>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[hsl(228_18%_45%)]">
        إذا كان عمرك 60 عاماً أو أكثر، يمكنك الاستفادة من عرض شراء 2 واحصل على الأرخص مجاناً لكل 3 قطع.
      </p>

      {promoEnabled === false && (
        <p className="mt-2 max-w-xl text-sm text-[hsl(228_18%_50%)]">العرض غير متاح حالياً</p>
      )}

      {status?.seniorVerified ? (
        <div className="mt-8 max-w-md border-y border-gold-500/70 bg-[hsl(42_60%_97%)] px-6 py-6">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-9 w-9 shrink-0 text-gold-600" strokeWidth={1.3} />
            <div>
              <p className="font-plex-arabic font-semibold text-[hsl(228_40%_14%)]">أنت مسجّل كعضو في العرض الخاص</p>
              {status.nationalIdLast4 && (
                <p className="mt-1 font-archivo text-sm text-[hsl(228_18%_45%)]" style={{ direction: "ltr" }}>
                  رقم الهوية: ****{status.nationalIdLast4}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 max-w-md">
          <div className="space-y-2.5">
            <label htmlFor="national-id" className={authLabelClass}>
              رقم الهوية الوطنية (14 رقماً)
            </label>
            <div className={authFieldBoxClass()}>
              <input
                id="national-id"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={14}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
                placeholder="2XXXXXXXXXXXX"
                dir="ltr"
                className={authBareInputClass}
              />
            </div>
            <p className={authHelpClass}>
              نتحقق من عمرك فقط. يُحفظ الرقم مشفّرًا ولا يُعرض كاملًا ولن نشاركه.
            </p>
          </div>
          <AuthSubmitButton
            className="mt-6 h-14 w-full max-w-xs"
            disabled={nationalId.length !== 14 || submitting}
          >
            {submitting ? "جاري التحقق…" : "إرسال للتحقق"}
          </AuthSubmitButton>
        </form>
      )}
    </div>
  );
}
