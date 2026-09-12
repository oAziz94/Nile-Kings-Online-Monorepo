"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Skeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { usePartnerSettings, useUpdatePartnerSettings } from "@/hooks/use-partner-settings";

/**
 * `/partner/settings` (backlog 4.17) — the per-partner low-stock threshold (user decision
 * 2026-09-12: default 5, replaces the previously hardcoded `<= 3` checks). Drives: the
 * alerts feed, the `/partner` home counts/panels, `/partner/products` colouring and the
 * `?lowStock=1` filter, and the reports stock panel's low/out flags (4.22).
 */

const settingsFormSchema = z.object({
  lowStockThreshold: z
    .string()
    .trim()
    .min(1, "أدخل حد التنبيه")
    .refine((value) => /^\d+$/.test(value), "حد التنبيه يجب أن يكون رقماً صحيحاً")
    .refine((value) => Number(value) <= 999, "الحد الأقصى 999"),
});
type SettingsFormValues = z.infer<typeof settingsFormSchema>;

export default function PartnerSettingsPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerSettings();
  const updateSettings = useUpdatePartnerSettings();

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: { lowStockThreshold: "" },
  });

  React.useEffect(() => {
    if (data) {
      form.reset({ lowStockThreshold: String(data.lowStockThreshold) });
    }
  }, [data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updateSettings.mutateAsync({ lowStockThreshold: Number(values.lowStockThreshold) });
      toast({ title: "تم حفظ الإعدادات" });
    } catch (error) {
      toast({
        title: "تعذر حفظ الإعدادات",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  });

  return (
    <div>
      <PageHeader title="الإعدادات" description="إعدادات المخزون والتنبيهات الخاصة بحسابك." />

      <PanelCard title="حد التنبيه للمخزون المنخفض" icon={<SettingsIcon className="h-4 w-4 text-ink-soft" />} className="max-w-xl">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full max-w-xs rounded-2xl" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="rounded-lg border border-carnelian-500/30 bg-danger-bg p-4 text-danger-text">
            <p className="flex items-center gap-2 text-sm font-bold">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              تعذر تحميل الإعدادات
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 flex items-center gap-1 text-xs font-bold underline underline-offset-2"
            >
              <RefreshCw className={isFetching ? "h-3 w-3 animate-spin" : "h-3 w-3"} />
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem className="max-w-xs">
                    <FormLabel>حد التنبيه (عدد القطع)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={999}
                        dir="ltr"
                        className="text-right"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      عندما يصل عدد القطع القابلة للبيع لأي صنف إلى هذا الرقم أو أقل، يُعتبر &quot;مخزون منخفض&quot; —
                      يظهر في التنبيهات وصفحة النظرة العامة، ويُلوَّن في صفحة المخزون وتقرير المخزون.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateSettings.isPending || !form.formState.isDirty}>
                {updateSettings.isPending ? "جاري الحفظ…" : "حفظ"}
              </Button>
            </form>
          </Form>
        )}
      </PanelCard>
    </div>
  );
}
