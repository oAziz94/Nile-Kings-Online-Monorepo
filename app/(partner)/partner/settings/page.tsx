"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Banknote, Bell, Boxes, MapPin, RefreshCw, Settings as SettingsIcon, Truck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Skeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  type HandoverMethod,
  usePartnerSettings,
  usePartnerThresholds,
  useUpdatePartnerSettings,
  useUpdatePartnerThresholds,
} from "@/hooks/use-partner-settings";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

/**
 * `/partner/settings` (backlog 4.17, rebuilt to `Settings.dc.html` per backlog 5.1) —
 * sectioned page, one save button per section (react-hook-form + Zod per section):
 * working profile, stock thresholds, alerts, service areas, handover method, plus a
 * read-only "حسابك مع المصنع" block. `costRateBps` is never sent from here (rule 18).
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

const HANDOVER_OPTIONS: { value: HandoverMethod; label: string; description: string }[] = [
  { value: "COURIER", label: "شركة شحن", description: "يُستلم من عندك ويُشحن" },
  { value: "PICKUP", label: "استلام من المحل", description: "العميل يأتي إليك" },
  { value: "OWN_DELIVERY", label: "توصيل خاص", description: "مندوبك يوصّل بنفسه" },
];

const ALERT_KINDS: { key: string; label: string }[] = [
  { key: "new_order", label: "طلب جديد مُسند إليك" },
  { key: "overdue", label: "طلب تجاوز مهلة التأكيد أو الشحن" },
  { key: "low_stock", label: "صنف نزل تحت الحد" },
  { key: "restock", label: "نشاط طلبات التوريد" },
];

function ErrorBlock({ onRetry, isFetching }: { onRetry: () => void; isFetching?: boolean }) {
  return (
    <div role="alert" className="rounded-lg border border-carnelian-500/30 bg-danger-bg p-4 text-danger-text">
      <p className="flex items-center gap-2 text-sm font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        تعذر تحميل الإعدادات
      </p>
      <button type="button" onClick={onRetry} className="mt-2 flex items-center gap-1 text-xs font-bold underline underline-offset-2">
        <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
        إعادة المحاولة
      </button>
    </div>
  );
}

const workingProfileSchema = z.object({
  workingDays: z.array(z.string()).min(1, "اختر يوم عمل واحد على الأقل"),
  dailyOrderCapacity: z.string().refine((v) => v === "" || /^\d+$/.test(v), "رقم صحيح فقط"),
  confirmSlaHours: z
    .string()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "رقم صحيح أكبر من صفر"),
  shipSlaHours: z
    .string()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "رقم صحيح أكبر من صفر"),
});
type WorkingProfileValues = z.infer<typeof workingProfileSchema>;

function WorkingProfileSection() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  const update = useUpdatePartnerSettings();
  const form = useForm<WorkingProfileValues>({
    resolver: zodResolver(workingProfileSchema),
    defaultValues: { workingDays: [], dailyOrderCapacity: "", confirmSlaHours: "24", shipSlaHours: "48" },
  });

  React.useEffect(() => {
    if (data) {
      form.reset({
        workingDays: data.workingDays,
        dailyOrderCapacity: data.dailyOrderCapacity == null ? "" : String(data.dailyOrderCapacity),
        confirmSlaHours: String(data.confirmSlaHours),
        shipSlaHours: String(data.shipSlaHours),
      });
    }
  }, [data, form]);

  const days = form.watch("workingDays");

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        workingDays: values.workingDays,
        dailyOrderCapacity: values.dailyOrderCapacity === "" ? null : Number(values.dailyOrderCapacity),
        confirmSlaHours: Number(values.confirmSlaHours),
        shipSlaHours: Number(values.shipSlaHours),
      });
      toast({ title: "تم حفظ ملف العمل" });
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  });

  return (
    <PanelCard layout="split" title="ملف العمل" description="يحدد ما تراه في «اليوم»: مقياس الطاقة، وقاعدة التأخير، وأيام الراحة." icon={<SettingsIcon className="h-4 w-4 text-ink-soft" />}>
      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
      ) : (
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-soft">أيام العمل</p>
              <div className="flex flex-wrap gap-2">
                {WORKING_DAYS.map((d) => {
                  const active = days.includes(d.code);
                  return (
                    <button
                      key={d.code}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        form.setValue(
                          "workingDays",
                          active ? days.filter((c) => c !== d.code) : [...days, d.code],
                          { shouldDirty: true }
                        )
                      }
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
              {form.formState.errors.workingDays && (
                <p className="text-xs font-semibold text-danger-text">{form.formState.errors.workingDays.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="dailyOrderCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الطاقة اليومية (طلب)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" dir="ltr" min={0} placeholder="بلا حد" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmSlaHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>مهلة التأكيد (ساعة)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" dir="ltr" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shipSlaHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>مهلة الشحن بعد التأكيد (ساعة)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" dir="ltr" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" size="sm" disabled={update.isPending || !form.formState.isDirty}>
              {update.isPending ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </form>
        </Form>
      )}
    </PanelCard>
  );
}

function ThresholdsSection() {
  const { toast } = useToast();
  const { data: settings } = usePartnerSettings();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerThresholds();
  const updateDefault = useUpdatePartnerSettings();
  const updateThresholds = useUpdatePartnerThresholds();

  const [defaultThreshold, setDefaultThreshold] = React.useState("");
  const [categoryValues, setCategoryValues] = React.useState<Record<string, string>>({});
  const [productOverrides, setProductOverrides] = React.useState<{ productId: string; name: string; threshold: number }[]>([]);
  const [productQuery, setProductQuery] = React.useState("");
  const [productResults, setProductResults] = React.useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    if (settings) setDefaultThreshold(String(settings.lowStockThreshold));
  }, [settings]);

  React.useEffect(() => {
    if (data) {
      setCategoryValues(
        Object.fromEntries(data.categories.map((c) => [c.categoryId, c.threshold == null ? "" : String(c.threshold)]))
      );
      setProductOverrides(data.productOverrides);
    }
  }, [data]);

  React.useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 2) {
      setProductResults([]);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      fetch(`/api/partner/inventory?q=${encodeURIComponent(q)}&limit=6`, { credentials: "include" })
        .then((r) => r.json())
        .then((json: { data?: { products?: { id: string; name: string }[] } }) => {
          setProductResults(json?.data?.products ?? []);
        })
        .catch(() => setProductResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [productQuery]);

  const saveDefault = async () => {
    const n = Number(defaultThreshold);
    if (!/^\d+$/.test(defaultThreshold) || n > 999) {
      toast({ title: "الحد الافتراضي يجب أن يكون رقماً صحيحاً بين 0 و999", variant: "destructive" });
      return;
    }
    try {
      await updateDefault.mutateAsync({ lowStockThreshold: n });
      toast({ title: "تم حفظ الحد الافتراضي" });
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  const saveOverrides = async () => {
    const categoryThresholds: Record<string, number | null> = {};
    for (const c of data?.categories ?? []) {
      const raw = categoryValues[c.categoryId] ?? "";
      categoryThresholds[c.categoryId] = raw === "" ? null : Number(raw);
    }
    try {
      await updateThresholds.mutateAsync({
        categoryThresholds,
        productThresholds: productOverrides.map((p) => ({ productId: p.productId, threshold: p.threshold })),
      });
      toast({ title: "تم حفظ حدود المخزون" });
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <PanelCard layout="split" title="حدود المخزون" description="الحد الذي يُعد الصنف عنده منخفضًا. يُحسب لكل منتج ← فئة ← الافتراضي." icon={<Boxes className="h-4 w-4 text-ink-soft" />}>
      <div className="space-y-4">
        <div className="max-w-[220px] space-y-1.5">
          <label className="text-xs font-bold text-ink-soft" htmlFor="default-threshold">الحد الافتراضي</label>
          <div className="flex items-center gap-2">
            <Input
              id="default-threshold"
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={0}
              max={999}
              value={defaultThreshold}
              onChange={(e) => setDefaultThreshold(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="حفظ الحد الافتراضي"
              onClick={saveDefault}
              disabled={updateDefault.isPending}
            >
              حفظ
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full rounded-2xl" />
        ) : isError ? (
          <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-stone-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-stone-50 text-right text-xs font-extrabold text-ink-soft">
                    <th className="px-3 py-2">الفئة</th>
                    <th className="px-3 py-2">الحد</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.categories.map((c) => (
                    <tr key={c.categoryId} className="border-t border-stone-100">
                      <td className="px-3 py-2 font-semibold text-ink">{c.name}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          dir="ltr"
                          min={0}
                          max={999}
                          placeholder="الافتراضي"
                          className="h-8 w-24"
                          value={categoryValues[c.categoryId] ?? ""}
                          onChange={(e) =>
                            setCategoryValues((prev) => ({ ...prev, [c.categoryId]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-soft">حدود لمنتجات بعينها</p>
              {productOverrides.length > 0 && (
                <ul className="space-y-1">
                  {productOverrides.map((p) => (
                    <li key={p.productId} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        dir="ltr"
                        min={0}
                        max={999}
                        className="h-8 w-20"
                        value={p.threshold}
                        onChange={(e) =>
                          setProductOverrides((prev) =>
                            prev.map((row) =>
                              row.productId === p.productId ? { ...row, threshold: Number(e.target.value) || 0 } : row
                            )
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-xs font-bold text-carnelian-600 underline underline-offset-2"
                        onClick={() => setProductOverrides((prev) => prev.filter((row) => row.productId !== p.productId))}
                      >
                        إزالة
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="relative max-w-sm">
                <Input
                  placeholder="أضف حدًا خاصًا لمنتج بعينه…"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  aria-label="بحث عن منتج لإضافة حد خاص"
                />
                {productQuery.trim().length >= 2 && (
                  <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-soft">
                    {searching ? (
                      <p className="p-2 text-xs text-ink-soft">جارٍ البحث…</p>
                    ) : productResults.length === 0 ? (
                      <p className="p-2 text-xs text-ink-soft">لا نتائج</p>
                    ) : (
                      productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-right text-sm hover:bg-stone-50"
                          onClick={() => {
                            setProductOverrides((prev) =>
                              prev.some((row) => row.productId === p.id)
                                ? prev
                                : [...prev, { productId: p.id, name: p.name, threshold: 5 }]
                            );
                            setProductQuery("");
                            setProductResults([]);
                          }}
                        >
                          {p.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <Button type="button" size="sm" onClick={saveOverrides} disabled={updateThresholds.isPending}>
              {updateThresholds.isPending ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </>
        )}
      </div>
    </PanelCard>
  );
}

const inventoryReportSettingsSchema = z.object({
  deadStockDays: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "رقم صحيح أكبر من صفر"),
  targetCoverDays: z.string().refine((v) => /^\d+$/.test(v) && Number(v) >= 1, "رقم صحيح أكبر من صفر"),
});
type InventoryReportSettingsValues = z.infer<typeof inventoryReportSettingsSchema>;

/**
 * Reports platform (backlog 5.6a) — the two inventory-report settings: `deadStockDays`
 * (no sale in N days marks a SKU "راكد") and `targetCoverDays` (the reorder formula's
 * target cover). Same save-per-section pattern as `WorkingProfileSection`.
 */
function InventoryReportSettingsSection() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  const update = useUpdatePartnerSettings();
  const form = useForm<InventoryReportSettingsValues>({
    resolver: zodResolver(inventoryReportSettingsSchema),
    defaultValues: { deadStockDays: "60", targetCoverDays: "21" },
  });

  React.useEffect(() => {
    if (data) {
      form.reset({
        deadStockDays: String(data.deadStockDays),
        targetCoverDays: String(data.targetCoverDays),
      });
    }
  }, [data, form]);

  const onSubmit = async (values: InventoryReportSettingsValues) => {
    try {
      await update.mutateAsync({
        deadStockDays: Number(values.deadStockDays),
        targetCoverDays: Number(values.targetCoverDays),
      });
      toast({ title: "تم حفظ إعدادات تقرير المخزون" });
      form.reset(values);
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <PanelCard
      layout="split"
      title="تقرير المخزون"
      description="تستخدمها صفحة «تقرير المخزون» لحساب الراكد ومقترح إعادة الطلب."
      icon={<Boxes className="h-4 w-4 text-ink-soft" />}
    >
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="deadStockDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الراكد = بلا بيع (يوم)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" dir="ltr" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="targetCoverDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>هدف أيام التغطية</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" dir="ltr" min={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" size="sm" disabled={update.isPending || !form.formState.isDirty}>
              {update.isPending ? "جاري الحفظ…" : "حفظ"}
            </Button>
          </form>
        </Form>
      )}
    </PanelCard>
  );
}

function AlertsSection() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  const update = useUpdatePartnerSettings();
  const [prefs, setPrefs] = React.useState<Record<string, boolean>>({});
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setPrefs(Object.fromEntries(ALERT_KINDS.map((k) => [k.key, data.alertPrefs?.[k.key] ?? true])));
      setDirty(false);
    }
  }, [data]);

  const save = async () => {
    try {
      await update.mutateAsync({ alertPrefs: prefs });
      toast({ title: "تم حفظ التنبيهات" });
      setDirty(false);
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <PanelCard layout="split" title="التنبيهات" description="ما يظهر في الجرس وفي «اليوم». كل التنبيهات داخل البوابة فقط." icon={<Bell className="h-4 w-4 text-ink-soft" />}>
      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
      ) : (
        <div className="space-y-3">
          {ALERT_KINDS.map((k) => (
            <div key={k.key} className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3 first:border-t-0 first:pt-0">
              <label htmlFor={`alert-${k.key}`} className="text-sm font-semibold text-ink">
                {k.label}
              </label>
              <Switch
                id={`alert-${k.key}`}
                checked={prefs[k.key] ?? true}
                onCheckedChange={(checked) => {
                  setPrefs((prev) => ({ ...prev, [k.key]: checked }));
                  setDirty(true);
                }}
              />
            </div>
          ))}
          <Button type="button" size="sm" onClick={save} disabled={update.isPending || !dirty}>
            {update.isPending ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </div>
      )}
    </PanelCard>
  );
}

function AccountWithFactorySection() {
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  return (
    <PanelCard layout="split"
      title="حسابك مع المصنع"
      description="نسبة شرائك تحددها الإدارة ولا تُعدَّل من هنا. تُستخدم في تقرير المال وقيمة المخزون."
      icon={<Banknote className="h-4 w-4 text-ink-soft" />}
    >
      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-ink-soft">نسبة الشراء من سعر البيع</p>
            <p className="flex h-10 items-center rounded-lg bg-stone-100 px-3 text-sm font-bold text-ink-soft" dir="ltr">
              {formatNumberEn(Math.round((data?.costRateBps ?? 0) / 100))}%
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-ink-soft">هامشك</p>
            <p className="flex h-10 items-center rounded-lg bg-stone-100 px-3 text-sm font-bold text-ink-soft" dir="ltr">
              {formatNumberEn(Math.round((data?.marginBps ?? 0) / 100))}%
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-bold text-ink-soft">طريقة السداد</p>
            <p className="flex h-10 items-center rounded-lg bg-stone-100 px-3 text-sm font-bold text-ink-soft">
              {data?.paymentMethodLabel}
            </p>
          </div>
        </div>
      )}
    </PanelCard>
  );
}

function ServiceAreasSection() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  const update = useUpdatePartnerSettings();
  const [governorate, setGovernorate] = React.useState("");
  const [areas, setAreas] = React.useState<Record<string, string[]>>({});
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setAreas(data.serviceAreas ?? {});
      setDirty(false);
    }
  }, [data]);

  const addGovernorate = () => {
    const g = governorate.trim();
    if (!g || areas[g]) return;
    setAreas((prev) => ({ ...prev, [g]: [] }));
    setGovernorate("");
    setDirty(true);
  };

  const removeGovernorate = (g: string) => {
    setAreas((prev) => {
      const next = { ...prev };
      delete next[g];
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    try {
      await update.mutateAsync({ serviceAreas: areas });
      toast({ title: "تم حفظ مناطق الخدمة" });
      setDirty(false);
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <PanelCard layout="split"
      title="مناطق الخدمة"
      description="للعلم فقط في هذه المرحلة: تظهر للإدارة ولا تغيّر توجيه الطلبات."
      icon={<MapPin className="h-4 w-4 text-ink-soft" />}
    >
      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(areas).map((g) => (
              <span key={g} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-lapis-800 bg-lapis-800 px-3 text-xs font-bold text-white">
                {g}
                <button type="button" onClick={() => removeGovernorate(g)} aria-label={`إزالة ${g}`} className="text-white/80 hover:text-white">
                  ×
                </button>
              </span>
            ))}
            <Input
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addGovernorate();
                }
              }}
              placeholder="اسم المحافظة"
              className="h-8 w-40"
              aria-label="اسم المحافظة الجديدة"
            />
            <Button type="button" size="sm" variant="outline" onClick={addGovernorate}>
              إضافة
            </Button>
          </div>
          <Button type="button" size="sm" onClick={save} disabled={update.isPending || !dirty}>
            {update.isPending ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </div>
      )}
    </PanelCard>
  );
}

function HandoverSection() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  const update = useUpdatePartnerSettings();
  const [value, setValue] = React.useState<HandoverMethod>("COURIER");
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setValue(data.handoverMethod);
      setDirty(false);
    }
  }, [data]);

  const save = async () => {
    try {
      await update.mutateAsync({ handoverMethod: value });
      toast({ title: "تم حفظ طريقة التسليم" });
      setDirty(false);
    } catch (error) {
      toast({ title: "تعذر الحفظ", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    }
  };

  return (
    <PanelCard layout="split" title="طريقة التسليم" description="الافتراضي عند تجهيز الطلب. يمكنك تغييره لكل طلب." icon={<Truck className="h-4 w-4 text-ink-soft" />}>
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-2xl" />
      ) : isError ? (
        <ErrorBlock onRetry={() => refetch()} isFetching={isFetching} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="طريقة التسليم">
            {HANDOVER_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={value === o.value}
                onClick={() => {
                  setValue(o.value);
                  setDirty(true);
                }}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-3.5 text-right transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
                  value === o.value ? "border-lapis-800" : "border-stone-200"
                )}
              >
                <span className="flex w-full items-center justify-between text-sm font-extrabold text-ink">
                  {o.label}
                  <span
                    className={cn(
                      "inline-block h-4 w-4 rounded-full border-2",
                      value === o.value ? "border-lapis-800 bg-lapis-800 ring-2 ring-white ring-inset" : "border-stone-300 bg-white"
                    )}
                  />
                </span>
                <span className="text-xs text-ink-soft">{o.description}</span>
              </button>
            ))}
          </div>
          <Button type="button" size="sm" onClick={save} disabled={update.isPending || !dirty}>
            {update.isPending ? "جاري الحفظ…" : "حفظ"}
          </Button>
        </div>
      )}
    </PanelCard>
  );
}

export default function PartnerSettingsPage() {
  return (
    <div>
      <PageHeader title="الإعدادات" description="كل ما يجعل البوابة تعمل بطريقتك." />
      <div className="flex flex-col gap-5">
        <WorkingProfileSection />
        <ThresholdsSection />
        <InventoryReportSettingsSection />
        <AlertsSection />
        <AccountWithFactorySection />
        <ServiceAreasSection />
        <HandoverSection />
      </div>
    </div>
  );
}
