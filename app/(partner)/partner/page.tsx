"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  Clock,
  Coins,
  Plus,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Skeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";
import { QueueGroupSection } from "@/components/partner/today/queue-group";
import { OrderQueueRow, RestockQueueRow, LowStockQueueRow } from "@/components/partner/today/rows";
import { TrendChart } from "@/components/partner/today/trend-chart";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { usePartnerToday } from "@/hooks/use-partner-today";
import { useToast } from "@/hooks/use-toast";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";

/**
 * `/partner` — اليوم (backlog 5.2, `05-partner-portal-v2.md` §4.2, `Main.dc.html`).
 * Replaces the 4.17 "النظرة العامة" home entirely: KPIs, capacity meter, the six-group
 * action queue and the 30-day trend, all from `GET /api/partner/today`. "Every row has one
 * obvious next action — the numbers above are context, not the point."
 */

function pct(current: number, previous: number): { tone: "up" | "down" | "flat"; text: string } {
  if (previous === 0 && current === 0) return { tone: "flat", text: "—" };
  if (previous === 0) return { tone: "up", text: "+100%" };
  const delta = Math.round(((current - previous) / previous) * 100);
  if (delta === 0) return { tone: "flat", text: "—" };
  return { tone: delta > 0 ? "up" : "down", text: `${delta > 0 ? "+" : ""}${delta}%` };
}

function diff(current: number, previous: number): { tone: "up" | "down" | "flat"; text: string } {
  const delta = current - previous;
  if (delta === 0) return { tone: "flat", text: "—" };
  return { tone: delta > 0 ? "up" : "down", text: `${delta > 0 ? "+" : ""}${formatNumberEn(delta)}` };
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-carnelian-500/30 bg-danger-bg p-5 text-danger-text shadow-soft sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        تعذر تحميل البيانات
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs font-bold"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        إعادة المحاولة
      </button>
    </div>
  );
}

export default function PartnerTodayPage() {
  const { data: me } = usePartnerMe();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerToday();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [metric, setMetric] = React.useState<"revenue" | "orders">("revenue");
  const [pendingOrderId, setPendingOrderId] = React.useState<string | null>(null);
  const [pendingVariantId, setPendingVariantId] = React.useState<string | null>(null);

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["partner-today"] });
  }, [queryClient]);

  const advanceOrder = React.useCallback(
    async (orderId: string, nextStatus: string, successMessage: string) => {
      setPendingOrderId(orderId);
      try {
        const res = await fetch(`/api/partner/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          toast({ title: successMessage });
          invalidate();
        } else {
          toast({ title: json?.error?.message ?? "فشل تحديث حالة الطلب", variant: "destructive" });
        }
      } catch (error) {
        toast({
          title: "فشل تحديث حالة الطلب",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      } finally {
        setPendingOrderId(null);
      }
    },
    [invalidate, toast]
  );

  const quickAdjust = React.useCallback(
    async (variantId: string, amount: number) => {
      setPendingVariantId(variantId);
      try {
        const res = await fetch("/api/partner/inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ variantId, delta: amount }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) {
          toast({ title: "تم تحديث المخزون" });
          invalidate();
        } else {
          toast({ title: json?.error?.message ?? "فشل تحديث المخزون", variant: "destructive" });
        }
      } catch (error) {
        toast({
          title: "فشل تحديث المخزون",
          description: error instanceof Error ? error.message : undefined,
          variant: "destructive",
        });
      } finally {
        setPendingVariantId(null);
      }
    },
    [invalidate, toast]
  );

  const isAgent = (data?.partnerType ?? me?.partnerType) === "AGENT";
  const now = new Date();
  const dayNumber = now.getDate();
  const weekday = now.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long" });
  const monthYear = now.toLocaleDateString("ar-EG-u-nu-latn", { month: "long", year: "numeric" });

  const revenueDelta = data
    ? pct(data.kpis.revenueThisWeekPiastres, data.kpis.revenueLastWeekPiastres)
    : undefined;
  const ordersDelta = data ? diff(data.kpis.ordersToday, data.kpis.ordersYesterday) : undefined;

  return (
    <div>
      <PageHeader
        title="اليوم"
        description={
          me?.name
            ? `${weekday} ${formatNumberEn(dayNumber)} ${monthYear} · ${me.name}`
            : `${weekday} ${formatNumberEn(dayNumber)} ${monthYear}`
        }
      />

      {isError ? (
        <ErrorPanel onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div data-testid="kpi-orders-today">
              <KpiCard
                title="طلبات اليوم"
                value={isLoading ? "" : formatNumberEn(data?.kpis.ordersToday ?? 0)}
                icon={<ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint={data ? `أمس ${formatNumberEn(data.kpis.ordersYesterday)}` : undefined}
                delta={ordersDelta}
              />
            </div>
            <div data-testid="kpi-revenue-week">
              <KpiCard
                title="إيراد هذا الأسبوع"
                value={isLoading ? "" : formatNumberEn(piastresToEgp(data?.kpis.revenueThisWeekPiastres ?? 0))}
                icon={<Coins className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint={
                  data
                    ? `الأسبوع الماضي ${formatNumberEn(piastresToEgp(data.kpis.revenueLastWeekPiastres))}`
                    : undefined
                }
                delta={revenueDelta}
              />
            </div>
            <div data-testid="kpi-sellable-units">
              <KpiCard
                title="وحدات قابلة للبيع"
                value={isLoading ? "" : formatNumberEn(data?.kpis.sellableUnits ?? 0)}
                icon={<Boxes className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint={data ? `${formatNumberEn(data.kpis.underThresholdCount)} صنفًا تحت الحد` : undefined}
                delta={{ tone: "flat", text: "—" }}
              />
            </div>
            <div data-testid="kpi-overdue">
              <KpiCard
                title="طلبات متأخرة"
                value={isLoading ? "" : formatNumberEn(data?.kpis.overdueCount ?? 0)}
                icon={<Clock className="h-[18px] w-[18px]" strokeWidth={2} />}
                accent="gold"
                loading={isLoading}
                hint="متأخرة عن مهلة التأكيد/التجهيز"
                delta={
                  data && data.kpis.overdueCount > 0
                    ? { tone: "down", text: `+${formatNumberEn(data.kpis.overdueCount)}` }
                    : { tone: "flat", text: "—" }
                }
              />
            </div>
          </div>

          {/* Trend + date/capacity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <PanelCard
              title="الإيراد آخر 30 يومًا"
              toolbar={
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMetric("revenue")}
                    aria-pressed={metric === "revenue"}
                    className={
                      metric === "revenue"
                        ? "flex h-8 items-center rounded-full bg-lapis-800 px-3 text-xs font-bold text-white"
                        : "flex h-8 items-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-ink"
                    }
                  >
                    الإيراد
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetric("orders")}
                    aria-pressed={metric === "orders"}
                    className={
                      metric === "orders"
                        ? "flex h-8 items-center rounded-full bg-lapis-800 px-3 text-xs font-bold text-white"
                        : "flex h-8 items-center rounded-full border border-stone-200 bg-white px-3 text-xs font-semibold text-ink"
                    }
                  >
                    الطلبات
                  </button>
                </div>
              }
              noPadding
            >
              <div className="px-2 pb-3 pt-2 sm:px-3">
                {data && (
                  <p className="mb-1 flex items-center gap-2 px-2 text-xs text-ink-soft">
                    مقارنة بالفترة السابقة
                    {data.trendDeltaPercent !== null ? (
                      <span
                        className={
                          data.trendDeltaPercent >= 0
                            ? "inline-flex items-center rounded-full bg-malachite-bg px-2 py-0.5 text-[11px] font-extrabold text-malachite-text"
                            : "inline-flex items-center rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-extrabold text-danger-text"
                        }
                      >
                        <span dir="ltr">
                          {data.trendDeltaPercent > 0 ? "+" : ""}
                          {formatNumberEn(data.trendDeltaPercent)}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </p>
                )}
                {isLoading ? (
                  <Skeleton className="h-[220px] w-full rounded-xl" />
                ) : data?.trendError ? (
                  <ErrorPanel onRetry={() => refetch()} />
                ) : (
                  <TrendChart metric={metric} current={data?.trend ?? []} previous={data?.previousTrend ?? []} />
                )}
              </div>
            </PanelCard>

            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3.5 rounded-2xl bg-white p-4 shadow-soft sm:p-5">
                <div
                  dir="ltr"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-stone-200 text-xl font-extrabold text-ink"
                >
                  {formatNumberEn(dayNumber)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-extrabold text-ink">{weekday}</p>
                  <p className="text-xs text-ink-soft">
                    {monthYear} · {data ? (data.workingDay ? "يوم عمل" : "غير يوم عمل") : "..."}
                  </p>
                </div>
                {isAgent && (
                  <Button asChild size="sm" className="h-8 shrink-0 rounded-full px-3 text-xs">
                    <Link href="/partner/receipts/new">
                      <Plus className="h-3.5 w-3.5" />
                      استلام من المصنع
                    </Link>
                  </Button>
                )}
              </div>

              {isLoading ? (
                <Skeleton className="h-24 w-full rounded-2xl" />
              ) : data && data.workingDay && data.capacity.capacity !== null ? (
                <div data-testid="capacity-meter" className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-soft sm:p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-ink">طاقة اليوم</span>
                    <span dir="ltr" className="text-xs text-ink-soft">
                      {formatNumberEn(data.capacity.used)} / {formatNumberEn(data.capacity.capacity)} طلبًا
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-lapis-800"
                      style={{
                        width: `${Math.min(100, (data.capacity.used / Math.max(1, data.capacity.capacity)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-ink-soft">
                    {data.capacity.remaining !== null && data.capacity.remaining > 0
                      ? `تستطيع استقبال ${formatNumberEn(data.capacity.remaining)} طلبًا آخر اليوم قبل بلوغ طاقتك.`
                      : "بلغت طاقتك اليوم."}
                  </p>
                </div>
              ) : !data?.workingDay && data ? (
                <div className="rounded-2xl bg-white p-4 text-sm text-ink-soft shadow-soft sm:p-5">
                  اليوم ليس يوم عمل — لا حدود على استقبال الطلبات.
                </div>
              ) : null}
            </div>
          </div>

          {/* Queue */}
          <PanelCard title="ما يحتاج قرارك الآن" description="كل صف له إجراء واحد واضح — نفّذه من هنا." noPadding>
            {isLoading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-40 rounded" />
                <Skeleton className="h-14 w-full rounded-lg" />
                <Skeleton className="h-14 w-full rounded-lg" />
              </div>
            ) : !data ? null : (
              <div>
                <QueueGroupSection
                  first
                  testId="queue-group-to-confirm"
                  rowKey={(row) => row.id}
                  title="بانتظار التأكيد"
                  tone="info"
                  count={data.queue.toConfirm.count}
                  rows={data.queue.toConfirm.rows}
                  moreCount={data.queue.toConfirm.moreCount}
                  viewAllHref="/partner/orders?stage=CREATED"
                  renderRow={(row) => (
                    <OrderQueueRow
                      row={row}
                      actionLabel="تأكيد"
                      pending={pendingOrderId === row.id}
                      onAction={() => advanceOrder(row.id, "CONFIRMED", "تم تأكيد الطلب")}
                    />
                  )}
                />
                <QueueGroupSection
                  testId="queue-group-overdue"
                  rowKey={(row) => row.id}
                  title="متأخرة عن المهلة"
                  tone="danger"
                  count={data.queue.overdue.count}
                  rows={data.queue.overdue.rows}
                  moreCount={data.queue.overdue.moreCount}
                  viewAllHref="/partner/orders?stage=overdue&overdue=1"
                  renderRow={(row) => (
                    <OrderQueueRow
                      row={row}
                      actionLabel={row.status === "CONFIRMED" ? "بدء التجهيز" : "جاهز للتسليم"}
                      pending={pendingOrderId === row.id}
                      onAction={() =>
                        advanceOrder(
                          row.id,
                          row.status === "CONFIRMED" ? "PROCESSING" : "READY_TO_SHIP",
                          "تم تحديث حالة الطلب"
                        )
                      }
                    />
                  )}
                />
                <QueueGroupSection
                  testId="queue-group-ready-to-ship"
                  rowKey={(row) => row.id}
                  title="جاهزة للتسليم"
                  tone="warning"
                  count={data.queue.readyToShip.count}
                  rows={data.queue.readyToShip.rows}
                  moreCount={data.queue.readyToShip.moreCount}
                  viewAllHref="/partner/orders?stage=READY_TO_SHIP"
                  renderRow={(row) => (
                    <OrderQueueRow
                      row={row}
                      actionLabel="تم التسليم للمندوب"
                      pending={pendingOrderId === row.id}
                      onAction={() => advanceOrder(row.id, "SHIPPED", "تم تسليم الطلب للمندوب")}
                    />
                  )}
                />
                <QueueGroupSection
                  testId="queue-group-confirmed"
                  rowKey={(row) => row.id}
                  title="مؤكدة للتجهيز"
                  tone="neutral"
                  count={data.queue.confirmed.count}
                  rows={data.queue.confirmed.rows}
                  moreCount={data.queue.confirmed.moreCount}
                  viewAllHref="/partner/orders?stage=CONFIRMED"
                  renderRow={(row) => (
                    <OrderQueueRow
                      row={row}
                      actionLabel="بدء التجهيز"
                      pending={pendingOrderId === row.id}
                      onAction={() => advanceOrder(row.id, "PROCESSING", "بدأ تجهيز الطلب")}
                    />
                  )}
                />
                <QueueGroupSection
                  testId="queue-group-restock"
                  rowKey={(row) => row.id}
                  title={isAgent ? "طلبات توريد واردة" : "قرارات على طلباتك"}
                  tone="info"
                  count={data.queue.restock.count}
                  rows={data.queue.restock.rows}
                  moreCount={data.queue.restock.moreCount}
                  viewAllHref={isAgent ? "/partner/distributor-requests" : "/partner/restock-requests"}
                  renderRow={(row) => <RestockQueueRow row={row} />}
                />
                <QueueGroupSection
                  testId="queue-group-low-stock"
                  rowKey={(row) => row.variantId}
                  title="مخزون تحت الحد"
                  tone="warning"
                  count={data.queue.lowStock.count}
                  rows={data.queue.lowStock.rows}
                  moreCount={data.queue.lowStock.moreCount}
                  viewAllHref="/partner/stock?lowStock=1"
                  renderRow={(row) => (
                    <LowStockQueueRow
                      row={row}
                      pending={pendingVariantId === row.variantId}
                      onAdjust={(amount) => quickAdjust(row.variantId, amount)}
                    />
                  )}
                />
                {data.queue.toConfirm.count === 0 &&
                  data.queue.overdue.count === 0 &&
                  data.queue.readyToShip.count === 0 &&
                  data.queue.confirmed.count === 0 &&
                  data.queue.restock.count === 0 &&
                  data.queue.lowStock.count === 0 && (
                    <p className="p-8 text-center text-sm text-ink-soft">لا يوجد ما يحتاج قرارك الآن</p>
                  )}
              </div>
            )}
          </PanelCard>

          {isFetching && !isLoading && (
            <p className="text-center text-xs text-ink-soft">جارٍ التحديث…</p>
          )}
        </div>
      )}
    </div>
  );
}
