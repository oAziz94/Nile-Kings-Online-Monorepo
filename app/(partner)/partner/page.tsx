"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  ClipboardCheck,
  PackageCheck,
  PackageX,
  RefreshCw,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PanelCard } from "@/components/dashboard/panel-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { usePartnerDashboard } from "@/hooks/use-partner-dashboard";
import { formatNumberEn } from "@/lib/format-en-numbers";

/**
 * `/partner` home (backlog 4.17) — replaces the one-line redirect
 * (`00-feature-inventory/partner/dashboard.md`: "the redesign's parity target... is simply
 * authenticated partner visiting `/partner` lands on the products/stock screen"; approved
 * change per `02-proposals.md` "Real partner dashboard/home" — a real landing screen).
 * Four stat tiles from `GET /api/partner/dashboard`'s order-status counts, plus three
 * attention panels (orders needing action, low stock, restock activity) — every number a
 * real Prisma aggregate, nothing here is a placeholder.
 */

const RESTOCK_STATUS_LABEL: Record<string, string> = {
  PENDING: "قيد الانتظار",
  APPROVED: "تمت الموافقة",
  REJECTED: "مرفوض",
  FULFILLED: "تم التنفيذ",
  CANCELLED: "ملغي",
};

export default function PartnerHomePage() {
  const { data: me } = usePartnerMe();
  const { data, isLoading, isError, refetch, isFetching } = usePartnerDashboard();

  const isAgent = (data?.partnerType ?? me?.partnerType) === "AGENT";

  return (
    <div>
      <PageHeader
        title="النظرة العامة"
        description={me?.name ? `أهلاً بك، ${me.name}` : "نظرة سريعة على حسابك اليوم"}
      />

      {isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-[14px] border border-carnelian-500/30 bg-danger-bg p-5 text-danger-text sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-center gap-2 text-sm font-bold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            تعذر تحميل بيانات لوحة التحكم
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-current px-3 py-1.5 text-xs font-bold"
          >
            <RefreshCw className={isFetching ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div data-testid="kpi-created">
              <KpiCard
                title="طلبات جديدة"
                value={isLoading ? "" : formatNumberEn(data?.orders.CREATED ?? 0)}
                icon={<ShoppingBag className="h-4 w-4" />}
                accent="gold"
                loading={isLoading}
              />
            </div>
            <div data-testid="kpi-confirmed">
              <KpiCard
                title="مؤكدة"
                value={isLoading ? "" : formatNumberEn(data?.orders.CONFIRMED ?? 0)}
                icon={<ClipboardCheck className="h-4 w-4" />}
                accent="slate"
                loading={isLoading}
              />
            </div>
            <div data-testid="kpi-processing">
              <KpiCard
                title="قيد التجهيز"
                value={isLoading ? "" : formatNumberEn(data?.orders.PROCESSING ?? 0)}
                icon={<Boxes className="h-4 w-4" />}
                accent="burgundy"
                loading={isLoading}
              />
            </div>
            <div data-testid="kpi-ready">
              <KpiCard
                title="جاهزة للشحن"
                value={isLoading ? "" : formatNumberEn(data?.orders.READY_TO_SHIP ?? 0)}
                hint={
                  !isLoading && data
                    ? `تم شحن ${formatNumberEn(data.orders.shippedToday)} اليوم`
                    : undefined
                }
                icon={<Truck className="h-4 w-4" />}
                accent="emerald"
                loading={isLoading}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PanelCard title="طلبات تحتاج انتباهك" icon={<ShoppingBag className="h-4 w-4 text-ink-soft" />}>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : (
                <ul className="space-y-1">
                  {(
                    [
                      ["CREATED", "طلبات جديدة", data?.orders.CREATED ?? 0],
                      ["CONFIRMED", "مؤكدة", data?.orders.CONFIRMED ?? 0],
                      ["PROCESSING", "قيد التجهيز", data?.orders.PROCESSING ?? 0],
                      ["READY_TO_SHIP", "جاهزة للشحن", data?.orders.READY_TO_SHIP ?? 0],
                    ] as const
                  ).map(([status, label, count]) => (
                    <li key={status}>
                      <Link
                        href={`/partner/routed-orders?status=${status}`}
                        className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-ink transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                      >
                        <span className="font-semibold">{label}</span>
                        <span className="flex items-center gap-1 text-ink-soft">
                          {formatNumberEn(count)}
                          <ArrowLeft className="h-3.5 w-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </PanelCard>

            <PanelCard
              title="مخزون منخفض"
              icon={<PackageX className="h-4 w-4 text-ink-soft" />}
              toolbar={
                !isLoading && data ? (
                  <span
                    data-testid="low-stock-count"
                    className="rounded-full bg-danger-bg px-2.5 py-1 text-xs font-bold text-danger-text"
                  >
                    {formatNumberEn(data.lowStockCount)}
                  </span>
                ) : undefined
              }
            >
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : !data || data.topLowStockLines.length === 0 ? (
                <EmptyState
                  icon={<PackageCheck className="h-8 w-8" />}
                  title="لا يوجد مخزون منخفض"
                  description="كل الأصناف فوق حد التنبيه المحدد."
                />
              ) : (
                <>
                  <ul className="space-y-1">
                    {data.topLowStockLines.map((line) => (
                      <li key={line.variantId} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm">
                        <span className="min-w-0 truncate font-semibold text-ink">
                          {line.productName} — {line.variantName}
                        </span>
                        <span dir="ltr" className="shrink-0 font-bold text-carnelian-600">
                          {formatNumberEn(line.sellable)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/partner/products?lowStock=1"
                    className="mt-3 flex items-center gap-1 text-xs font-bold text-lapis-800 underline underline-offset-2"
                  >
                    عرض كل المخزون المنخفض
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </PanelCard>

            <PanelCard
              title="نشاط إعادة التوريد"
              icon={<Users className="h-4 w-4 text-ink-soft" />}
            >
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : !data || data.restock.recent.length === 0 ? (
                <EmptyState
                  icon={<Boxes className="h-8 w-8" />}
                  title="لا يوجد نشاط بعد"
                  description={isAgent ? "لا توجد طلبات إعادة توريد واردة." : "لم تُنشئ أي طلب إعادة توريد بعد."}
                />
              ) : (
                <>
                  <p className="mb-2 text-xs font-bold text-ink-soft">
                    {isAgent
                      ? `${formatNumberEn(data.restock.pendingCount)} طلب قيد الانتظار`
                      : `${formatNumberEn(data.restock.pendingCount)} طلب قيد المعالجة`}
                  </p>
                  <ul className="space-y-1">
                    {data.restock.recent.map((item) => (
                      <li key={item.id} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm">
                        <span className="min-w-0 truncate">
                          <span className="font-semibold text-ink">{item.counterpartyName}</span>
                          <span className="text-ink-soft"> · {formatNumberEn(item.itemCount)} صنف</span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-ink-soft">
                          {RESTOCK_STATUS_LABEL[item.status] ?? item.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={isAgent ? "/partner/distributor-requests" : "/partner/restock-requests"}
                    className="mt-3 flex items-center gap-1 text-xs font-bold text-lapis-800 underline underline-offset-2"
                  >
                    عرض كل الطلبات
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </PanelCard>
          </div>

          {isAgent && data && (
            <p className="mt-4 text-xs text-ink-soft">
              <span dir="ltr">{formatNumberEn(data.activeDistributorCount ?? 0)}</span> — الموزعون النشطون المرتبطون بحسابك
            </p>
          )}
        </>
      )}
    </div>
  );
}
