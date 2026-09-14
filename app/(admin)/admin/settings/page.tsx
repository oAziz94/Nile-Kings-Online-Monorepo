"use client";

/**
 * `/admin/settings` (backlog 9.7 (b)), rebuilt per `Settings.dc.html` (generator block 13):
 * a two-column grid (one column below `lg`) of four independently-saved groups — المتجر,
 * الشركاء · افتراضيات الشبكة, الأمان, الإشعارات. A confirm dialog guards anything in المتجر
 * that changes a customer's price (COD fee, senior promo — both do, so both are guarded).
 * Every field with audit history shows `SettingPreviousValue`'s "السابق … · … · أنت" line.
 *
 * أسعار الشحن: `app/api/admin/shipping-rules` exists but no screen renders a UI against it
 * yet, so this shows the artboard's own "قريبًا" caption instead of a live editor (task text:
 * "if `app/api/admin/shipping-rules` already has a UI, else a قريبًا line naming the Phase 5
 * item" — no numbered Phase 5 backlog item names this specific editor yet; `06-admin-v2.md`
 * §3.7 only says "when the admin-editable calculator lands (Phase 5)", so that's what this
 * caption cites).
 */
import * as React from "react";
import { Bell, Percent, Shield, Store, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SettingPreviousValue } from "@/components/admin/setting-previous-value";

function Toggle({
  on,
  onToggle,
  disabled,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Accessible name (verifier fix, 9.7 review): every `role="switch"` needs one — there is
   * no visible `<label>` element bound to these, only adjacent text, so `aria-label` rather
   * than `aria-labelledby` (no `id` to point at without adding one purely for this). */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-stone-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 disabled:opacity-50",
        on ? "bg-lapis-800" : "bg-stone-200"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition",
          on ? "translate-x-5 rtl:-translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function Field({
  id,
  label,
  unit,
  value,
  onChange,
  width = "w-24",
  min,
  max,
}: {
  id: string;
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  width?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs font-bold text-ink">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          dir="ltr"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-10", width)}
        />
        {unit && <span className="text-xs text-ink-soft">{unit}</span>}
      </div>
    </div>
  );
}

// ---------- المتجر ----------

function StoreGroup() {
  const { toast } = useToast();
  const [codFeePercent, setCodFeePercent] = React.useState("0");
  const [seniorPromoEnabled, setSeniorPromoEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [historyKey, setHistoryKey] = React.useState(0);

  const load = React.useCallback(() => {
    Promise.all([
      fetch("/api/admin/settings/cod-fee", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/settings/senior-promo", { credentials: "include" }).then((r) => r.json()),
    ])
      .then(([codRes, promoRes]) => {
        if (codRes?.success) setCodFeePercent(String(codRes.data.codFeePercent ?? 0));
        if (promoRes?.success) setSeniorPromoEnabled(Boolean(promoRes.data.enabled));
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const percentVal = Math.max(0, Math.min(100, Number(codFeePercent) || 0));
      const [codRes, promoRes] = await Promise.all([
        fetch("/api/admin/settings/cod-fee", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codFeePiastres: 0, codFeePercent: percentVal }),
        }).then((r) => r.json()),
        fetch("/api/admin/settings/senior-promo", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: seniorPromoEnabled }),
        }).then((r) => r.json()),
      ]);
      if (codRes?.success && promoRes?.success) {
        toast({ title: "تم حفظ إعدادات المتجر" });
        setHistoryKey((k) => k + 1);
      } else {
        toast({ title: codRes?.error?.message ?? promoRes?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  };

  if (loading) return <PanelCard title="المتجر" icon={<Store className="h-4 w-4" />}><p className="text-sm text-ink-soft">جاري التحميل…</p></PanelCard>;

  return (
    <>
      <PanelCard
        title="المتجر"
        description="يغيّر ما يراه العميل — يُطلب تأكيد قبل الحفظ"
        icon={<Store className="h-4 w-4 text-lapis-800" />}
        toolbar={
          <Button type="button" size="sm" className="rounded-full" onClick={() => setConfirmOpen(true)} disabled={saving}>
            حفظ
          </Button>
        }
      >
        <div className="space-y-4">
          <div>
            <Field
              id="cod-fee-percent"
              label="رسوم الدفع عند الاستلام"
              unit="% من (المنتجات + التوصيل − الخصم)"
              value={codFeePercent}
              onChange={setCodFeePercent}
              min={0}
              max={100}
            />
            <SettingPreviousValue
              key={`cod-${historyKey}`}
              entityType="settings"
              entityId="cod-fee"
              field="codFeePercent"
              format={(v) => `${v}%`}
            />
          </div>

          <div className="border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-extrabold text-ink">خصم كبار السن</p>
                <p className="text-[11px] text-ink-soft">مفعّل في المتجر · كان مبنيًا ولا يظهر في أي شاشة</p>
              </div>
              <Toggle label="خصم كبار السن" on={seniorPromoEnabled} onToggle={() => setSeniorPromoEnabled((v) => !v)} />
            </div>
            <SettingPreviousValue
              key={`promo-${historyKey}`}
              entityType="settings"
              entityId="senior-promo"
              field="enabled"
              format={(v) => (v ? "مفعّل" : "معطّل")}
            />
          </div>

          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <div>
              <p className="text-[13px] font-extrabold text-ink">أسعار الشحن</p>
              <p className="text-[11px] text-ink-soft">مصر للبريد · 6 مناطق × شرائح وزن · تُقرأ من هنا بعد مهمة الشحن (المرحلة 5)</p>
            </div>
            <span className="text-xs font-bold text-ink-soft">قريبًا</span>
          </div>
        </div>
      </PanelCard>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد تغيير يمس سعر العميل</DialogTitle>
            <DialogDescription>
              رسوم الدفع عند الاستلام أو خصم كبار السن يظهران للعميل مباشرة. هل تريد المتابعة؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "جاري الحفظ…" : "تأكيد الحفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- الشركاء · افتراضيات الشبكة ----------

function NetworkDefaultsGroup() {
  const { toast } = useToast();
  const [values, setValues] = React.useState({
    costRatePct: "75",
    confirmSlaHours: "24",
    shipSlaHours: "48",
    lowStockThreshold: "5",
    deadStockDays: "60",
    targetCoverDays: "21",
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [historyKey, setHistoryKey] = React.useState(0);

  const load = React.useCallback(() => {
    fetch("/api/admin/settings/partner-defaults", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          setValues({
            costRatePct: String(Math.round(json.data.costRateBps / 100)),
            confirmSlaHours: String(json.data.confirmSlaHours),
            shipSlaHours: String(json.data.shipSlaHours),
            lowStockThreshold: String(json.data.lowStockThreshold),
            deadStockDays: String(json.data.deadStockDays),
            targetCoverDays: String(json.data.targetCoverDays),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/partner-defaults", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costRateBps: Math.round(Number(values.costRatePct) * 100),
          confirmSlaHours: Number(values.confirmSlaHours),
          shipSlaHours: Number(values.shipSlaHours),
          lowStockThreshold: Number(values.lowStockThreshold),
          deadStockDays: Number(values.deadStockDays),
          targetCoverDays: Number(values.targetCoverDays),
        }),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم حفظ افتراضيات الشبكة" });
        load();
        setHistoryKey((k) => k + 1);
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PanelCard title="الشركاء · افتراضيات الشبكة" icon={<Users className="h-4 w-4" />}><p className="text-sm text-ink-soft">جاري التحميل…</p></PanelCard>;

  return (
    <PanelCard
      title="الشركاء · افتراضيات الشبكة"
      description="يرثها كل شريك جديد؛ لا تغيّر شريكًا قائمًا إلا من ملفه"
      icon={<Users className="h-4 w-4 text-lapis-800" />}
      toolbar={
        <Button type="button" size="sm" className="rounded-full" onClick={save} disabled={saving}>
          حفظ
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <Field id="net-cost-rate" label="نسبة الشراء" unit="%" value={values.costRatePct} onChange={(v) => setValues((s) => ({ ...s, costRatePct: v }))} min={0} max={100} />
          <SettingPreviousValue key={`cost-rate-${historyKey}`} entityType="settings" entityId="partner-defaults" field="costRateBps" format={(v) => `${Math.round(Number(v) / 100)}%`} />
        </div>
        <div>
          <Field id="net-confirm-sla" label="مهلة التأكيد" unit="ساعة" value={values.confirmSlaHours} onChange={(v) => setValues((s) => ({ ...s, confirmSlaHours: v }))} min={1} />
          <SettingPreviousValue key={`confirm-sla-${historyKey}`} entityType="settings" entityId="partner-defaults" field="confirmSlaHours" format={(v) => `${v} ساعة`} />
        </div>
        <div>
          <Field id="net-ship-sla" label="مهلة الشحن" unit="ساعة" value={values.shipSlaHours} onChange={(v) => setValues((s) => ({ ...s, shipSlaHours: v }))} min={1} />
          <SettingPreviousValue key={`ship-sla-${historyKey}`} entityType="settings" entityId="partner-defaults" field="shipSlaHours" format={(v) => `${v} ساعة`} />
        </div>
        <div>
          <Field id="net-low-stock" label="حد المخزون المنخفض" unit="قطعة" value={values.lowStockThreshold} onChange={(v) => setValues((s) => ({ ...s, lowStockThreshold: v }))} min={0} />
          <SettingPreviousValue key={`low-stock-${historyKey}`} entityType="settings" entityId="partner-defaults" field="lowStockThreshold" format={(v) => `${v} قطعة`} />
        </div>
        <div>
          <Field id="net-dead-stock" label="راكد بعد" unit="يومًا" value={values.deadStockDays} onChange={(v) => setValues((s) => ({ ...s, deadStockDays: v }))} min={1} />
          <SettingPreviousValue key={`dead-stock-${historyKey}`} entityType="settings" entityId="partner-defaults" field="deadStockDays" format={(v) => `${v} يومًا`} />
        </div>
        <div>
          <Field id="net-target-cover" label="تغطية مستهدفة" unit="يومًا" value={values.targetCoverDays} onChange={(v) => setValues((s) => ({ ...s, targetCoverDays: v }))} min={1} />
          <SettingPreviousValue key={`target-cover-${historyKey}`} entityType="settings" entityId="partner-defaults" field="targetCoverDays" format={(v) => `${v} يومًا`} />
        </div>
      </div>
      <p className="mt-3 text-[11px] text-ink-soft">تغيير الافتراضي لا يمس أي شريك قائم — يسري على الشركاء الجدد فقط.</p>
    </PanelCard>
  );
}

// ---------- الأمان ----------

function SecurityGroup() {
  const { toast } = useToast();
  const [values, setValues] = React.useState({ expiryMinutes: "10", cooldownSeconds: "60", maxVerifyAttempts: "5", lockMinutes: "15" });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [historyKey, setHistoryKey] = React.useState(0);

  const load = React.useCallback(() => {
    fetch("/api/admin/settings/otp-rules", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          setValues({
            expiryMinutes: String(json.data.expiryMinutes),
            cooldownSeconds: String(json.data.cooldownSeconds),
            maxVerifyAttempts: String(json.data.maxVerifyAttempts),
            lockMinutes: String(json.data.lockMinutes),
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/otp-rules", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiryMinutes: Number(values.expiryMinutes),
          cooldownSeconds: Number(values.cooldownSeconds),
          maxVerifyAttempts: Number(values.maxVerifyAttempts),
          lockMinutes: Number(values.lockMinutes),
        }),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم حفظ قواعد الأمان" });
        load();
        setHistoryKey((k) => k + 1);
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PanelCard title="الأمان" icon={<Shield className="h-4 w-4" />}><p className="text-sm text-ink-soft">جاري التحميل…</p></PanelCard>;

  return (
    <PanelCard
      title="الأمان"
      description="قواعد رمز التحقق — حدود دنيا وعليا مفروضة"
      icon={<Shield className="h-4 w-4 text-lapis-800" />}
      toolbar={
        <Button type="button" size="sm" className="rounded-full" onClick={save} disabled={saving}>
          حفظ
        </Button>
      }
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <Field id="otp-expiry" label="صلاحية الرمز" unit="دقائق" value={values.expiryMinutes} onChange={(v) => setValues((s) => ({ ...s, expiryMinutes: v }))} min={1} max={60} />
          <SettingPreviousValue key={`otp-expiry-${historyKey}`} entityType="settings" entityId="otp-rules" field="expiryMinutes" format={(v) => `${v} دقائق`} />
        </div>
        <div>
          <Field id="otp-cooldown" label="الانتظار بين الإرسالين" unit="ثانية" value={values.cooldownSeconds} onChange={(v) => setValues((s) => ({ ...s, cooldownSeconds: v }))} min={0} max={300} />
          <SettingPreviousValue key={`otp-cooldown-${historyKey}`} entityType="settings" entityId="otp-rules" field="cooldownSeconds" format={(v) => `${v} ثانية`} />
        </div>
        <div>
          <Field id="otp-attempts" label="محاولات التحقق" value={values.maxVerifyAttempts} onChange={(v) => setValues((s) => ({ ...s, maxVerifyAttempts: v }))} min={1} max={10} />
          <SettingPreviousValue key={`otp-attempts-${historyKey}`} entityType="settings" entityId="otp-rules" field="maxVerifyAttempts" format={(v) => `${v}`} />
        </div>
        <div>
          <Field id="otp-lock" label="مدة القفل" unit="دقيقة" value={values.lockMinutes} onChange={(v) => setValues((s) => ({ ...s, lockMinutes: v }))} min={1} max={60} />
          <SettingPreviousValue key={`otp-lock-${historyKey}`} entityType="settings" entityId="otp-rules" field="lockMinutes" format={(v) => `${v} دقيقة`} />
        </div>
      </div>
    </PanelCard>
  );
}

// ---------- الإشعارات ----------

const ALERT_TOGGLES: { key: string; label: string; defaultOn: boolean }[] = [
  { key: "unassignedOrderOverHour", label: "طلب بلا شريك لأكثر من ساعة", defaultOn: true },
  { key: "orderOverdueSla", label: "طلب تجاوز مهلة الشريك", defaultOn: true },
  { key: "newTicket", label: "سؤال عميل جديد", defaultOn: true },
  { key: "newPartnerRequest", label: "طلب شراكة جديد", defaultOn: true },
  { key: "partnerInstallmentDue", label: "قسط شريك استحق", defaultOn: true },
  { key: "partnerOutOfStock", label: "صنف نافد عند شريك", defaultOn: false },
];

function NotificationsGroup() {
  const { toast } = useToast();
  const [prefs, setPrefs] = React.useState<Record<string, boolean> | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [historyKey, setHistoryKey] = React.useState(0);

  const load = React.useCallback(() => {
    fetch("/api/admin/settings/alert-prefs", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) setPrefs(json.data);
      });
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings/alert-prefs", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      const json = await res.json();
      if (json?.success) {
        toast({ title: "تم حفظ الإشعارات" });
        setPrefs(json.data);
        setHistoryKey((k) => k + 1);
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return <PanelCard title="الإشعارات" icon={<Bell className="h-4 w-4" />}><p className="text-sm text-ink-soft">جاري التحميل…</p></PanelCard>;

  return (
    <PanelCard
      title="الإشعارات"
      description="ما يصلك أنت — لا علاقة له بتنبيهات الشركاء"
      icon={<Bell className="h-4 w-4 text-lapis-800" />}
      toolbar={
        <Button type="button" size="sm" className="rounded-full" onClick={save} disabled={saving}>
          حفظ
        </Button>
      }
    >
      <div>
        {ALERT_TOGGLES.map((t) => (
          <div key={t.key} className="border-t border-stone-100 py-2 first:border-0">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink">{t.label}</span>
              <Toggle
                label={t.label}
                on={prefs[t.key] ?? t.defaultOn}
                onToggle={() => setPrefs((p) => ({ ...(p ?? {}), [t.key]: !(p?.[t.key] ?? t.defaultOn) }))}
              />
            </div>
            <SettingPreviousValue
              key={`${t.key}-${historyKey}`}
              entityType="settings"
              entityId="alert-prefs"
              field={t.key}
              format={(v) => (v ? "مفعّل" : "معطّل")}
            />
          </div>
        ))}
      </div>
    </PanelCard>
  );
}

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="الإعدادات"
        description="أربع مجموعات · حفظ لكل مجموعة · كل تغيير في السجل بقيمته السابقة"
        badge={
          <span className="inline-flex items-center gap-1 rounded-full bg-lapis-50 px-2.5 py-0.5 text-xs font-bold text-lapis-800">
            <Percent className="h-3 w-3" />
            إعدادات النظام
          </span>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <StoreGroup />
        <NetworkDefaultsGroup />
        <SecurityGroup />
        <NotificationsGroup />
      </div>
    </div>
  );
}
