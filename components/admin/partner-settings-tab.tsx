"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";
import { PARTNER_NETWORK_DEFAULTS } from "@/lib/partner/settings-schema";

/**
 * الإعدادات tab on the partner profile (backlog 9.4a (e)) — every knob partner v2
 * introduced, admin-controlled in one place, per `06-admin-v2.md` §3.4/§8. Four groups:
 * المهل (admin-owned), المال (admin-owned), المخزون (partner-owned default, admin can
 * override), التشغيل (partner-owned, admin read + override). One save for the whole page;
 * "استعادة الافتراضي" resets the three admin-owned knobs (confirm/ship SLA + cost rate) to
 * the network defaults in `lib/partner/settings-schema.ts` (schema defaults 24/48/75% — no
 * stored network-default settings table exists yet, noted in the task text as acceptable).
 */

const WORKING_DAYS: { code: string; label: string }[] = [
  { code: "SAT", label: "السبت" },
  { code: "SUN", label: "الأحد" },
  { code: "MON", label: "الاثنين" },
  { code: "TUE", label: "الثلاثاء" },
  { code: "WED", label: "الأربعاء" },
  { code: "THU", label: "الخميس" },
  { code: "FRI", label: "الجمعة" },
];

type PartnerSettingsData = {
  confirmSlaHours: number;
  shipSlaHours: number;
  costRateBps: number;
  lowStockThreshold: number;
  deadStockDays: number;
  targetCoverDays: number;
  dailyOrderCapacity: number | null;
  workingDays: string[];
  handoverMethod: string;
  serviceAreas: unknown;
};

function OwnerPill({ owner }: { owner: "admin" | "partner" }) {
  return (
    <Badge variant={owner === "admin" ? "info" : "neutral"} className="rounded-full text-[10px] font-extrabold">
      {owner === "admin" ? "يحدده المصنع" : "يحدده الشريك"}
    </Badge>
  );
}

function KnobRow({
  label,
  hint,
  owner,
  defaultValue,
  children,
}: {
  label: string;
  hint?: string;
  owner: "admin" | "partner";
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-stone-100 py-3 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-ink">{label}</p>
          <OwnerPill owner={owner} />
        </div>
        {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
        <p className="mt-0.5 text-[11px] text-ink-soft">الافتراضي {defaultValue}</p>
      </div>
      <div className="sm:w-40">{children}</div>
    </div>
  );
}

export function PartnerSettingsTab({ partnerId }: { partnerId: string }) {
  const { toast } = useToast();
  const [data, setData] = React.useState<PartnerSettingsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [confirmSlaHours, setConfirmSlaHours] = React.useState("");
  const [shipSlaHours, setShipSlaHours] = React.useState("");
  const [costRatePct, setCostRatePct] = React.useState("");
  const [lowStockThreshold, setLowStockThreshold] = React.useState("");
  const [deadStockDays, setDeadStockDays] = React.useState("");
  const [targetCoverDays, setTargetCoverDays] = React.useState("");
  const [dailyOrderCapacity, setDailyOrderCapacity] = React.useState("");
  const [workingDays, setWorkingDays] = React.useState<string[]>([]);

  const applyData = React.useCallback((d: PartnerSettingsData) => {
    setData(d);
    setConfirmSlaHours(String(d.confirmSlaHours));
    setShipSlaHours(String(d.shipSlaHours));
    setCostRatePct(String(Math.round(d.costRateBps / 100)));
    setLowStockThreshold(String(d.lowStockThreshold));
    setDeadStockDays(String(d.deadStockDays));
    setTargetCoverDays(String(d.targetCoverDays));
    setDailyOrderCapacity(d.dailyOrderCapacity === null ? "" : String(d.dailyOrderCapacity));
    setWorkingDays(d.workingDays);
  }, []);

  const load = React.useCallback(() => {
    fetch(`/api/admin/partners/${partnerId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: PartnerSettingsData }) => {
        if (json?.success && json.data) applyData(json.data);
      })
      .finally(() => setLoading(false));
  }, [partnerId, applyData]);

  React.useEffect(() => {
    load();
  }, [load]);

  const resetAdminDefaults = () => {
    setConfirmSlaHours(String(PARTNER_NETWORK_DEFAULTS.confirmSlaHours));
    setShipSlaHours(String(PARTNER_NETWORK_DEFAULTS.shipSlaHours));
    setCostRatePct(String(Math.round(PARTNER_NETWORK_DEFAULTS.costRateBps / 100)));
  };

  const toggleDay = (code: string) => {
    setWorkingDays((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmSlaHours: Number(confirmSlaHours),
          shipSlaHours: Number(shipSlaHours),
          costRateBps: Math.round(Number(costRatePct) * 100),
          lowStockThreshold: Number(lowStockThreshold),
          deadStockDays: Number(deadStockDays),
          targetCoverDays: Number(targetCoverDays),
          dailyOrderCapacity: dailyOrderCapacity === "" ? null : Number(dailyOrderCapacity),
          workingDays,
        }),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم حفظ التغييرات" });
        applyData(json.data);
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-ink-soft">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري التحميل…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PanelCard title="المهل" description="مواعيد الوعد للعميل — لا تتغير من الشريك.">
        <KnobRow label="مهلة التأكيد (ساعة)" owner="admin" defaultValue={`${formatNumberEn(PARTNER_NETWORK_DEFAULTS.confirmSlaHours)} ساعة`}>
          <Input type="number" dir="ltr" min={1} value={confirmSlaHours} onChange={(e) => setConfirmSlaHours(e.target.value)} />
        </KnobRow>
        <KnobRow label="مهلة الشحن بعد التأكيد (ساعة)" owner="admin" defaultValue={`${formatNumberEn(PARTNER_NETWORK_DEFAULTS.shipSlaHours)} ساعة`}>
          <Input type="number" dir="ltr" min={1} value={shipSlaHours} onChange={(e) => setShipSlaHours(e.target.value)} />
        </KnobRow>
      </PanelCard>

      <PanelCard title="المال" description="نسبة الشراء من سعر البيع.">
        <KnobRow label="نسبة الشراء (%)" owner="admin" defaultValue={`${formatNumberEn(Math.round(PARTNER_NETWORK_DEFAULTS.costRateBps / 100))}%`}>
          <Input type="number" dir="ltr" min={0} max={100} value={costRatePct} onChange={(e) => setCostRatePct(e.target.value)} />
        </KnobRow>
      </PanelCard>

      <PanelCard title="المخزون" description="تنبيهات الشريك — قابلة للتعديل هنا كتجاوز.">
        <KnobRow label="الحد الأدنى للمخزون" owner="partner" defaultValue="5 قطع">
          <Input type="number" dir="ltr" min={0} value={lowStockThreshold} onChange={(e) => setLowStockThreshold(e.target.value)} />
        </KnobRow>
        <KnobRow label="أيام الركود" owner="partner" defaultValue="60 يوم">
          <Input type="number" dir="ltr" min={1} value={deadStockDays} onChange={(e) => setDeadStockDays(e.target.value)} />
        </KnobRow>
        <KnobRow label="هدف أيام التغطية" owner="partner" defaultValue="21 يوم">
          <Input type="number" dir="ltr" min={1} value={targetCoverDays} onChange={(e) => setTargetCoverDays(e.target.value)} />
        </KnobRow>
      </PanelCard>

      <PanelCard title="التشغيل" description="أيام العمل والطاقة اليومية — يحددها الشريك من إعداداته، معروضة هنا للتعديل عند الحاجة.">
        <div className="border-b border-stone-100 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink">أيام العمل</p>
            <OwnerPill owner="partner" />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {WORKING_DAYS.map((d) => {
              const active = workingDays.includes(d.code);
              return (
                <button
                  key={d.code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleDay(d.code)}
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                    active ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
        <KnobRow label="الطاقة اليومية (طلب)" owner="partner" defaultValue="بلا حد">
          <Input type="number" dir="ltr" min={0} placeholder="بلا حد" value={dailyOrderCapacity} onChange={(e) => setDailyOrderCapacity(e.target.value)} />
        </KnobRow>
        <div className="grid gap-1 py-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-ink">طريقة التسليم ومناطق الخدمة</p>
            <OwnerPill owner="partner" />
          </div>
          <p className="text-xs text-ink-soft">
            {data.handoverMethod === "COURIER" ? "شركة شحن" : data.handoverMethod === "PICKUP" ? "استلام من المحل" : "توصيل خاص"}
            {" — "}
            ملخص للقراءة فقط، يعدّله الشريك من إعداداته.
          </p>
        </div>
      </PanelCard>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} disabled={saving} className="rounded-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ التغييرات
        </Button>
        <Button type="button" variant="outline" onClick={resetAdminDefaults} disabled={saving} className="rounded-full">
          <RotateCcw className="h-4 w-4" />
          استعادة الافتراضي
        </Button>
      </div>
    </div>
  );
}
