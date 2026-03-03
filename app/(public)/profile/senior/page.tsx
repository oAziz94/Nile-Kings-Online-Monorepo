"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgeCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProfileSeniorPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [status, setStatus] = React.useState<{
    seniorVerified: boolean;
    nationalIdLast4: string | null;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [nationalId, setNationalId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/profile/senior", { credentials: "include" })
      .then((res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/senior");
          return null;
        }
        return res.json();
      })
      .then((json: { success?: boolean; data?: { seniorVerified: boolean; nationalIdLast4: string | null } }) => {
        if (json?.success && json.data) {
          setStatus(json.data);
        }
      })
      .catch(() => toast({ title: "خطأ في التحميل", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [router, toast]);

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
        toast({ title: "تم التحقق بنجاح. يمكنك الاستفادة من عرض أصحاب المعاشات." });
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
        <h1 className="text-2xl font-bold text-foreground">عرض أصحاب المعاشات</h1>
        <p className="mt-2 text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">عرض أصحاب المعاشات</h1>
      <p className="mt-2 text-muted-foreground">
        إذا كان عمرك 60 عاماً أو أكثر، يمكنك الاستفادة من عرض شراء 2 واحصل على الأرخص مجاناً لكل 3 قطع.
      </p>

      {status?.seniorVerified ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/40">
          <div className="flex items-center gap-3">
            <BadgeCheck className="h-10 w-10 text-amber-600 dark:text-amber-400" />
            <div>
              <p className="font-semibold text-amber-900 dark:text-amber-100">أنت مسجّل كعضو أصحاب المعاشات</p>
              {status.nationalIdLast4 && (
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  رقم الهوية: ****{status.nationalIdLast4}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 max-w-md rounded-2xl border border-border bg-card p-6">
          <label className="block text-sm font-medium text-foreground">
            رقم الهوية الوطنية (14 رقماً)
          </label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={14}
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ""))}
            placeholder="2XXXXXXXXXXXX"
            className="mt-2 rounded-xl"
            dir="ltr"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            نتحقق من عمرك فقط. لا نُخزّن الرقم كاملاً ولن نشاركه.
          </p>
          <Button type="submit" className="mt-4 rounded-2xl" disabled={nationalId.length !== 14 || submitting}>
            {submitting ? "جاري التحقق…" : "إرسال للتحقق"}
          </Button>
        </form>
      )}
    </div>
  );
}
