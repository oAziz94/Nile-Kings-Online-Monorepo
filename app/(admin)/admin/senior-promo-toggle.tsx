"use client";

import * as React from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function SeniorPromoToggle({ className }: { className?: string }) {
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    fetch("/api/admin/settings/senior-promo", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: { enabled: boolean } }) => {
        if (json?.success && typeof json.data?.enabled === "boolean") {
          setEnabled(json.data.enabled);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الإعداد", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const onToggle = async () => {
    if (enabled === null || updating) return;
    const next = !enabled;
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/settings/senior-promo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setEnabled(next);
        toast({
          title: next ? "تم تفعيل العرض الخاص" : "تم إيقاف العرض الخاص",
        });
      } else {
        toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <p className={cn("text-sm text-muted-foreground", className)}>جاري التحميل…</p>;
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={enabled ?? false}
        disabled={updating}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50",
          enabled ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow ring-0 transition translate-y-0.5",
            enabled ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
      <span className="text-sm font-medium text-foreground">
        العرض الخاص (شراء 2 واحصل على الأرخص مجاناً لكل 3 قطع)
      </span>
      <span className="text-sm text-muted-foreground">
        {enabled ? "مفعّل" : "معطّل"}
      </span>
    </div>
  );
}
