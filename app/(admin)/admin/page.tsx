"use client";

import * as React from "react";
import {
  AlertTriangle,
  Boxes,
  Coins,
  Handshake,
  MessageCircleQuestion,
  RefreshCw,
  ShoppingBag,
  Truck,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard, type KpiDeltaTone } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Skeleton } from "@/components/shared/skeleton";
import { AdminQueueCard } from "@/components/admin/today/queue-card";
import {
  DueBalanceQueueRow,
  LowStockQueueRowView,
  OverdueOrderQueueRow,
  PartnerRequestQueueRow,
  TicketQueueRowView,
  UnassignedOrderQueueRow,
} from "@/components/admin/today/rows";
import { TrendChart } from "@/components/partner/today/trend-chart";
import { useAdminToday } from "@/hooks/use-admin-today";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { computeDelta } from "@/lib/analytics/partner-reports";

/**
 * `/admin` — اليوم (backlog 9.2, `06-admin-v2.md` §3.1, `Main.dc.html`). Replaces the v1
 * KPI strip, "التقارير" button and quick-link tiles entirely: the queue first, the numbers
 * second, آخر النشاط last — "every row has one obvious next action".
 */

function countDeltaText(current: number, previous: number): { tone: KpiDeltaTone; text: string } {
  const delta = computeDelta(current, previous);
  if (delta.changePct === null) return { tone: "up", text: "جديد" };
  if (delta.changeAbs === 0) return { tone: "flat", text: "—" };
  const sign = delta.changeAbs > 0 ? "+" : "";
  return { tone: delta.direction === "up" ? "up" : "down", text: `${sign}${formatNumberEn(delta.changeAbs)}` };
}

function percentDeltaText(current: number, previous: number): { tone: KpiDeltaTone; text: string } {
  const delta = computeDelta(current, previous);
  if (delta.changePct === null) return { tone: "up", text: "جديد" };
  if (delta.changePct === 0) return { tone: "flat", text: "—" };
  const sign = delta.changePct > 0 ? "+" : "";
  return { tone: delta.direction === "up" ? "up" : "down", text: `${sign}${Math.round(delta.changePct)}%` };
}

/** Percentage-point difference, for rate KPIs ("−1.3 نقطة" / "+3 نقاط") — `up` is not
 * always good (cancellation), so the caller flips the tone for those. */
function pointsDeltaText(
  current: number,
  previous: number,
  upIsGood: boolean
): { tone: KpiDeltaTone; text: string } {
  const points = Math.round((current - previous) * 10) / 10;
  if (points === 0) return { tone: "flat", text: "—" };
  const sign = points > 0 ? "+" : "";
  const label = Math.abs(points) === 1 ? "نقطة" : "نقاط";
  const good = points > 0 ? upIsGood : !upIsGood;
  return { tone: good ? "up" : "down", text: `${sign}${points} ${label}` };
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

export default function AdminTodayPage() {
  const { data, isLoading, isError, refetch, isFetching } = useAdminToday();
  const [metric, setMetric] = React.useState<"revenue" | "orders">("orders");

  const now = new Date();
  const subtitle = `${now.toLocaleDateString("ar-EG-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })} · كل ما يحتاجك الآن`;

  return (
    <div>
      <PageHeader title="اليوم" description={subtitle} />

      {isError ? (
        <ErrorPanel onRetry={() => refetch()} />
      ) : (
        <div className="flex flex-col gap-5">
          {/* Queue — six cards, 3-column grid (2 at 1024, 1 at 390) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AdminQueueCard
              testId="queue-unassigned"
              title="طلبات بلا شريك"
              tone="danger"
              icon={<AlertTriangle className="h-4 w-4" />}
              count={data?.queues.unassigned.count ?? 0}
              loading={isLoading}
              rows={data?.queues.unassigned.rows ?? []}
              rowKey={(r) => r.id}
              renderRow={(r) => <UnassignedOrderQueueRow row={r} />}
              viewAllHref="/admin/orders?partner=none"
              viewAllLabel="كل الطلبات بلا شريك"
            />
            <AdminQueueCard
              testId="queue-overdue"
              title="متأخرة عند الشريك"
              tone="danger"
              icon={<Truck className="h-4 w-4" />}
              count={data?.queues.overdue.count ?? 0}
              loading={isLoading}
              rows={data?.queues.overdue.rows ?? []}
              rowKey={(r) => r.id}
              renderRow={(r) => <OverdueOrderQueueRow row={r} />}
              viewAllHref="/admin/orders?overdue=1"
              viewAllLabel="كل المتأخرة"
            />
            <AdminQueueCard
              testId="queue-tickets"
              title="أسئلة بانتظار الرد"
              tone="warning"
              icon={<MessageCircleQuestion className="h-4 w-4" />}
              count={data?.queues.tickets.count ?? 0}
              loading={isLoading}
              rows={data?.queues.tickets.rows ?? []}
              rowKey={(r) => r.id}
              renderRow={(r) => <TicketQueueRowView row={r} />}
              viewAllHref="/admin/order-tickets"
              viewAllLabel="صندوق الأسئلة"
            />
            <AdminQueueCard
              testId="queue-partner-requests"
              title="طلبات شراكة جديدة"
              tone="info"
              icon={<Handshake className="h-4 w-4" />}
              count={data?.queues.partnerRequests.count ?? 0}
              loading={isLoading}
              rows={data?.queues.partnerRequests.rows ?? []}
              rowKey={(r) => r.id}
              renderRow={(r) => <PartnerRequestQueueRow row={r} />}
              viewAllHref="/admin/partners"
              viewAllLabel="كل الطلبات"
            />
            <AdminQueueCard
              testId="queue-low-stock"
              title="أصناف نافدة أو قاربت"
              tone="warning"
              icon={<Boxes className="h-4 w-4" />}
              count={data?.queues.lowStock.count ?? 0}
              loading={isLoading}
              rows={data?.queues.lowStock.rows ?? []}
              rowKey={(r) => r.variantId}
              renderRow={(r) => <LowStockQueueRowView row={r} />}
              viewAllHref="/admin/partners?tab=network"
              viewAllLabel="مخزون الشبكة"
            />
            <AdminQueueCard
              testId="queue-due-payments"
              title="مستحقات شركاء"
              tone="warning"
              icon={<Coins className="h-4 w-4" />}
              count={data?.queues.duePayments.count ?? 0}
              loading={isLoading}
              rows={data?.queues.duePayments.rows ?? []}
              rowKey={(r) => r.partnerId}
              renderRow={(r) => <DueBalanceQueueRow row={r} />}
              viewAllHref="/admin/partners"
              viewAllLabel="الحساب المالي"
            />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div data-testid="kpi-orders-today">
              <KpiCard
                title="طلبات اليوم"
                value={isLoading ? "" : formatNumberEn(data?.kpis.ordersToday ?? 0)}
                icon={<ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2} />}
                loading={isLoading}
                hint={data ? `أمس ${formatNumberEn(data.kpis.ordersYesterday)}` : undefined}
                delta={data ? countDeltaText(data.kpis.ordersToday, data.kpis.ordersYesterday) : undefined}
              />
            </div>
            <div data-testid="kpi-revenue-week">
              <KpiCard
                title="إيراد مُسلَّم · 7 أيام"
                value={isLoading ? "" : formatNumberEn(Math.round((data?.kpis.revenueDeliveredWeekPiastres ?? 0) / 100))}
                icon={<Coins className="h-[18px] w-[18px]" strokeWidth={2} />}
                loading={isLoading}
                hint={
                  data
                    ? `الأسبوع الماضي ${formatNumberEn(Math.round(data.kpis.revenueDeliveredPrevWeekPiastres / 100))}`
                    : undefined
                }
                delta={
                  data
                    ? percentDeltaText(data.kpis.revenueDeliveredWeekPiastres, data.kpis.revenueDeliveredPrevWeekPiastres)
                    : undefined
                }
              />
            </div>
            <div data-testid="kpi-cancellation-rate">
              <KpiCard
                title="نسبة الإلغاء · 30 يومًا"
                value={isLoading ? "" : `${Math.round(data?.kpis.cancellationRate30 ?? 0)}%`}
                icon={<XCircle className="h-[18px] w-[18px]" strokeWidth={2} />}
                loading={isLoading}
                hint={data ? `الشهر الماضي ${Math.round(data.kpis.cancellationRatePrev30)}%` : undefined}
                delta={
                  data ? pointsDeltaText(data.kpis.cancellationRate30, data.kpis.cancellationRatePrev30, false) : undefined
                }
              />
            </div>
            <div data-testid="kpi-on-time-rate">
              <KpiCard
                title="في الموعد · 30 يومًا"
                value={isLoading ? "" : `${Math.round(data?.kpis.onTimeRate30 ?? 0)}%`}
                icon={<CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2} />}
                loading={isLoading}
                hint={data ? `الشهر الماضي ${Math.round(data.kpis.onTimeRatePrev30)}%` : undefined}
                delta={data ? pointsDeltaText(data.kpis.onTimeRate30, data.kpis.onTimeRatePrev30, true) : undefined}
              />
            </div>
          </div>

          {/* Trend + آخر النشاط */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <PanelCard
              title="الطلبات آخر 30 يومًا · الشبكة كلها"
              toolbar={
                <div className="flex items-center gap-1.5">
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
                </div>
              }
              noPadding
            >
              <div className="px-2 pb-3 pt-2 sm:px-3">
                <p className="mb-1 px-2 text-xs text-ink-soft">مقارنة بالفترة السابقة</p>
                {isLoading ? (
                  <Skeleton className="h-[220px] w-full rounded-xl" />
                ) : data?.trendError ? (
                  <ErrorPanel onRetry={() => refetch()} />
                ) : (
                  <TrendChart metric={metric} current={data?.trend ?? []} previous={data?.previousTrend ?? []} />
                )}
              </div>
            </PanelCard>

            <PanelCard
              title="آخر النشاط"
              description="من السجل · من فعل ماذا ومتى"
              toolbar={
                <Link href="/admin/audit" className="text-xs font-bold text-lapis-800 hover:underline">
                  السجل كاملًا
                </Link>
              }
              noPadding
            >
              {isLoading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : !data || data.recent.length === 0 ? (
                <p className="p-8 text-center text-sm text-ink-soft">لا يوجد نشاط بعد</p>
              ) : (
                <div data-testid="recent-activity">
                  {data.recent.map((row) => (
                    <div key={row.id} className="border-t border-stone-100 px-5 py-2.5 text-xs leading-relaxed first:border-t-0">
                      <span className="font-extrabold text-ink">{row.actorName}</span>{" "}
                      <span className="text-ink">{row.sentence}</span>
                      <p className="text-[11px] text-ink-soft">{formatRelativeTimeAr(row.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </PanelCard>
          </div>

          {isFetching && !isLoading && <p className="text-center text-xs text-ink-soft">جارٍ التحديث…</p>}
        </div>
      )}
    </div>
  );
}
