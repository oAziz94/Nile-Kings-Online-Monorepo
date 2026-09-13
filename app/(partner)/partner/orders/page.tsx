"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Eye, FileDown, Printer, RefreshCw, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { usePartnerMe } from "@/hooks/use-partner-me";
import { useToast } from "@/hooks/use-toast";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { piastresToEgp } from "@/lib/catalog";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import {
  ORDER_STATUS_LABELS as STATUS_LABELS,
  ORDER_STATUSES,
} from "@/lib/constants/order-status";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "إنستاباي",
  PAYMOB: "بطاقة",
};

type PillVariant = NonNullable<BadgeProps["variant"]>;

/** Same pill mapping as the v1 list (backlog 4.19) — the pipeline's tab order and pill
 * colours from `Orders.dc.html`: neutral(CREATED)/info/warning/warning/info/success/danger. */
const ORDER_STATUS_PILL_VARIANT: Record<string, PillVariant> = {
  CREATED: "info",
  CONFIRMED: "warning",
  PROCESSING: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const PILL_DOT_CLASS: Record<PillVariant, string> = {
  default: "bg-primary-foreground",
  secondary: "bg-secondary-foreground",
  destructive: "bg-destructive-foreground",
  outline: "bg-foreground",
  success: "bg-malachite-text",
  warning: "bg-warn-text",
  info: "bg-info-text",
  neutral: "bg-neutral-text",
  danger: "bg-danger-text",
};

function StatusPill({ variant, children }: { variant: PillVariant; children: React.ReactNode }) {
  return (
    <Badge variant={variant} className="gap-1.5 rounded-full text-[11px] font-extrabold">
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PILL_DOT_CLASS[variant])} />
      {children}
    </Badge>
  );
}

/** CREATED→CONFIRMED→PROCESSING→READY_TO_SHIP→SHIPPED; nothing beyond SHIPPED, never CANCELLED. */
const NEXT_STATUS: Record<string, string | undefined> = {
  CREATED: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "READY_TO_SHIP",
  READY_TO_SHIP: "SHIPPED",
  SHIPPED: undefined,
  DELIVERED: undefined,
  CANCELLED: undefined,
};

/** Tab order per `Orders.dc.html` — "" is "الكل". */
const STAGE_TABS: { value: string; label: string }[] = [
  { value: "", label: "الكل" },
  { value: "CREATED", label: "بانتظار التأكيد" },
  { value: "CONFIRMED", label: "مؤكد" },
  { value: "PROCESSING", label: "قيد التجهيز" },
  { value: "READY_TO_SHIP", label: "جاهز للتسليم" },
  { value: "SHIPPED", label: "تم الشحن" },
  { value: "DELIVERED", label: "تم التسليم" },
  { value: "CANCELLED", label: "ملغي" },
];

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

function relativeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `${days} يوم`;
}

type Order = {
  id: string;
  status: string;
  totalPiastres: number;
  paymentMethod: string;
  itemCount: number;
  statusSince: string;
  overdue: boolean;
  shippingAddress: { governorate?: string; city?: string | null; area?: string | null };
  createdAt: string;
  user: { phone: string; name: string | null };
};

type BulkResult = { id: string; ok: boolean; message?: string };

export default function PartnerOrdersPage() {
  return (
    <React.Suspense fallback={null}>
      <PartnerOrdersPageInner />
    </React.Suspense>
  );
}

function PartnerOrdersPageInner() {
  const { toast } = useToast();
  const { data: partner } = usePartnerMe();
  const partnerType = partner?.partnerType ?? null;
  const isAgent = partnerType === "AGENT";

  const [orders, setOrders] = React.useState<Order[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [allCount, setAllCount] = React.useState(0);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize, filters, setFilter } =
    useListUrlState(
      { status: "", governorate: "", payment: "", overdue: "", variantId: "" },
      25
    );
  const statusFilter = filters.status;
  const setStatusFilter = React.useCallback((value: string) => setFilter("status", value), [setFilter]);
  const governorateFilter = filters.governorate;
  const paymentFilter = filters.payment;
  const overdueOnly = filters.overdue === "1";
  const variantId = filters.variantId;
  const clearVariantFilter = React.useCallback(() => setFilter("variantId", ""), [setFilter]);

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [exportingShipping, setExportingShipping] = React.useState(false);
  const [rowUpdating, setRowUpdating] = React.useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const bulkTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [bulkTargetStatus, setBulkTargetStatus] = React.useState<string>(ORDER_STATUSES[0]);
  const [bulkSubmitting, setBulkSubmitting] = React.useState(false);

  const { rememberRow } = useRowScrollRestore("partner-orders-last-row", orders);
  const router = useRouter();

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedQ, statusFilter, governorateFilter, paymentFilter, overdueOnly, variantId, page, pageSize]);

  React.useEffect(() => {
    if (loading) return;
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [loading, page, pageSize, total, setPage]);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({ limit: String(pageSize), offset: String(page * pageSize) });
    if (debouncedQ) params.set("q", debouncedQ);
    if (statusFilter) params.set("status", statusFilter);
    if (governorateFilter) params.set("governorate", governorateFilter);
    if (paymentFilter) params.set("payment", paymentFilter);
    if (overdueOnly) params.set("overdue", "1");
    if (variantId) params.set("variantId", variantId);

    try {
      const res = await fetch(`/api/partner/routed-orders?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrders(json.data.orders ?? []);
        setTotal(json.data.total ?? 0);
        setCounts(json.data.counts ?? {});
        setAllCount(json.data.allCount ?? 0);
        setLoadError(null);
      } else {
        setLoadError(json?.error?.message ?? "فشل تحميل الطلبات");
        toast({ title: json?.error?.message ?? "فشل تحميل الطلبات", variant: "destructive" });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "خطأ غير متوقع";
      setLoadError("فشل تحميل الطلبات");
      toast({ title: "فشل تحميل الطلبات", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, page, pageSize, statusFilter, governorateFilter, paymentFilter, overdueOnly, variantId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleExportShipping = React.useCallback(async () => {
    const orderIds = Array.from(selectedIds);
    if (orderIds.length === 0) {
      toast({ title: "اختر طلبات للتصدير", description: "حدد طلبًا واحدًا على الأقل.", variant: "destructive" });
      return;
    }
    setExportingShipping(true);
    try {
      const res = await fetch(`/api/partner/routed-orders/export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({ title: "فشل التصدير", description: j?.error?.message ?? res.statusText, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? `shipments.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير ملف الشحن" });
      setSelectedIds(new Set());
    } catch (error) {
      toast({
        title: "فشل التصدير",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setExportingShipping(false);
    }
  }, [selectedIds, toast]);

  const advanceRowStatus = React.useCallback(
    async (order: Order) => {
      const next = NEXT_STATUS[order.status];
      if (!next) return;
      setRowUpdating(order.id);
      try {
        const res = await fetch(`/api/partner/orders/${order.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json?.success) {
          toast({ title: `تم تحديث الحالة إلى ${STATUS_LABELS[next] ?? next}` });
          load();
        } else {
          toast({ title: json?.error?.message ?? "فشل تحديث الحالة", variant: "destructive" });
        }
      } catch (error) {
        toast({
          title: "فشل تحديث الحالة",
          description: error instanceof Error ? error.message : "خطأ غير متوقع",
          variant: "destructive",
        });
      } finally {
        setRowUpdating(null);
      }
    },
    [toast, load]
  );

  const submitBulkStatus = React.useCallback(async () => {
    const orderIds = Array.from(selectedIds);
    if (orderIds.length === 0) return;
    setBulkSubmitting(true);
    try {
      const res = await fetch("/api/partner/routed-orders/bulk-status", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, status: bulkTargetStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        toast({ title: json?.error?.message ?? "فشل تحديث الحالة", variant: "destructive" });
        return;
      }
      const results: BulkResult[] = json.data.results ?? [];
      const okIds = results.filter((r) => r.ok).map((r) => r.id);
      const failed = results.filter((r) => !r.ok);
      setSelectedIds(new Set(failed.map((r) => r.id)));
      setBulkDialogOpen(false);
      const failedMessages = Array.from(new Set(failed.map((f) => f.message).filter(Boolean)));
      const title =
        failed.length > 0
          ? `تم تحديث ${okIds.length} · فشل ${failed.length}${failedMessages.length ? `: ${failedMessages.join("، ")}` : ""}`
          : `تم تحديث ${okIds.length} طلبات`;
      toast({ title, variant: failed.length > 0 ? "destructive" : "default" });
      load();
    } catch (error) {
      toast({
        title: "فشل تحديث الحالة",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setBulkSubmitting(false);
    }
  }, [selectedIds, bulkTargetStatus, toast, load]);

  const openPickList = React.useCallback(() => {
    const orderIds = Array.from(selectedIds);
    if (orderIds.length === 0) return;
    window.open(`/partner/orders/pick-list?ids=${orderIds.join(",")}`, "_blank", "noopener");
  }, [selectedIds]);

  const columns = React.useMemo<ColumnDef<Order, unknown>[]>(() => {
    const base: ColumnDef<Order, unknown>[] = [
      {
        id: "id",
        header: "رقم الطلب",
        cell: ({ row }) =>
          isAgent ? (
            <Link
              href={`/partner/orders/${row.original.id}`}
              dir="ltr"
              onClick={(e) => { e.stopPropagation(); rememberRow(row.original.id); }}
              className="font-mono text-xs text-lapis-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 rounded"
            >
              #{row.original.id.slice(0, 8)}
            </Link>
          ) : (
            <span dir="ltr" className="font-mono text-xs text-ink-soft">#{row.original.id.slice(0, 8)}</span>
          ),
      },
      {
        id: "customer",
        header: "العميل",
        cell: ({ row }) => (
          <span>
            <span dir="ltr">{row.original.user?.phone ?? "—"}</span>
            {row.original.user?.name ? ` (${row.original.user.name})` : ""}
          </span>
        ),
      },
      {
        id: "governorate",
        header: "المنطقة",
        cell: ({ row }) => {
          const a = row.original.shippingAddress ?? {};
          return <span className="text-ink-soft">{[a.area, a.governorate].filter(Boolean).join(" · ") || "—"}</span>;
        },
      },
      {
        id: "itemCount",
        header: "القطع",
        cell: ({ row }) => <span dir="ltr">{row.original.itemCount}</span>,
      },
      {
        id: "total",
        header: "الإجمالي",
        cell: ({ row }) => <span className="font-extrabold tabular-nums">{egp(row.original.totalPiastres)}</span>,
      },
      {
        id: "payment",
        header: "الدفع",
        cell: ({ row }) => PAYMENT_LABELS[row.original.paymentMethod] ?? row.original.paymentMethod ?? "—",
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill variant={ORDER_STATUS_PILL_VARIANT[o.status] ?? "neutral"}>
                {STATUS_LABELS[o.status] ?? o.status}
              </StatusPill>
              {o.overdue && <StatusPill variant="danger">متأخرة</StatusPill>}
            </div>
          );
        },
      },
      {
        id: "since",
        header: "منذ",
        cell: ({ row }) => <span className="text-ink-soft">{relativeSince(row.original.statusSince)}</span>,
      },
    ];

    base.push({
      id: "next-status",
      header: "الإجراء التالي",
      cell: ({ row }) => {
        const o = row.original;
        const next = NEXT_STATUS[o.status];
        // Every row offers "فتح" (the detail: full order, status change, item edits) next to
        // the quick advance — user report 2026-09-13: the link used to appear only on rows
        // with no next status, so an active order could not be opened from the list at all.
        const open = isAgent ? (
          <Button asChild type="button" size="sm" variant="outline" className="rounded-lg">
            <Link href={`/partner/orders/${o.id}`} onClick={(e) => { e.stopPropagation(); rememberRow(o.id); }}>
              <Eye className="h-3.5 w-3.5" />
              فتح
            </Link>
          </Button>
        ) : null;
        if (!next) {
          return open ?? <span className="text-xs text-ink-soft">—</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            {open}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg"
              disabled={rowUpdating === o.id}
              onClick={(e) => {
                e.stopPropagation();
                advanceRowStatus(o);
              }}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {rowUpdating === o.id ? "جاري…" : STATUS_LABELS[next] ?? next}
            </Button>
          </div>
        );
      },
    });

    return base;
  }, [isAgent, rowUpdating, advanceRowStatus, rememberRow]);

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الطلبات"
        description="خط سير الطلبات · مرحلة مرحلة."
        actions={
          <Button type="button" variant="outline" className="rounded-full" onClick={load} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      {variantId && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold-500/40 bg-gold-50 px-4 py-3 text-sm text-ink">
          <span>الطلبات مفلترة حسب متغير منتج محدد لمطابقة المخزون الفعلي.</span>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={clearVariantFilter}>
            إلغاء الفلتر
          </Button>
        </div>
      )}

      <PanelCard title="قائمة الطلبات" icon={<ShoppingBag className="h-5 w-5 text-lapis-800" />} noPadding>
        {/* Stage tabs */}
        <div role="tablist" aria-label="مراحل الطلبات" className="flex gap-1 overflow-x-auto border-b border-stone-200 px-4 pt-2 sm:px-[22px]">
          {STAGE_TABS.map((tab) => {
            const active = statusFilter === tab.value;
            const count = tab.value ? counts[tab.value] ?? 0 : allCount;
            return (
              <button
                key={tab.value || "all"}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setStatusFilter(tab.value)}
                onKeyDown={(e) => {
                  const tabs = Array.from(
                    e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
                  );
                  const i = tabs.indexOf(e.currentTarget);
                  if (i < 0) return;
                  // RTL row: ArrowLeft moves to the next tab, ArrowRight to the previous.
                  const next =
                    e.key === "ArrowLeft" ? i + 1 : e.key === "ArrowRight" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
                  if (next === null) return;
                  e.preventDefault();
                  const target = tabs[(next + tabs.length) % tabs.length];
                  target.focus();
                  target.click();
                }}
                className={cn(
                  "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
                  active ? "border-gold-500 text-lapis-800" : "border-transparent text-ink-soft hover:text-ink"
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[11px] font-extrabold leading-[18px]",
                    active ? "bg-lapis-50 text-lapis-800" : "bg-stone-100 text-ink-soft"
                  )}
                >
                  {formatNumberEn(count)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-[22px]">
          <SearchInput value={search} onChange={setSearch} placeholder="ابحث برقم الطلب أو اسم العميل أو الهاتف" className="sm:w-72" />
          <Select
            value={governorateFilter}
            onChange={(e) => setFilter("governorate", e.target.value)}
            className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs"
            aria-label="المحافظة"
          >
            <option value="">المحافظة</option>
            {GOVERNORATE_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </Select>
          <Select
            value={paymentFilter}
            onChange={(e) => setFilter("payment", e.target.value)}
            className="h-8 w-auto rounded-full border-stone-200 px-3 text-xs"
            aria-label="طريقة الدفع"
          >
            <option value="">طريقة الدفع</option>
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <button
            type="button"
            aria-pressed={overdueOnly}
            onClick={() => setFilter("overdue", overdueOnly ? "" : "1")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
              overdueOnly ? "border-lapis-800 bg-lapis-800 text-white" : "border-stone-200 bg-white text-ink"
            )}
          >
            متأخرة فقط
          </button>

          <div className="mr-auto flex items-center gap-2">
            {isAgent && selectedCount > 0 && (
              <>
                <Button ref={bulkTriggerRef} type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setBulkDialogOpen(true)}>
                  تغيير الحالة ({selectedCount})
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={openPickList}>
                  <Printer className="h-3.5 w-3.5" />
                  طباعة قائمة التجهيز
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleExportShipping}
              disabled={exportingShipping || selectedCount === 0}
            >
              <FileDown className="h-3.5 w-3.5" />
              {exportingShipping ? "جاري التصدير…" : `ملف الشحن (${selectedCount})`}
            </Button>
          </div>
        </div>

        {fetching && orders.length > 0 && (
          <div className="flex items-center gap-2 border-b border-stone-200 px-4 py-2 text-sm text-ink-soft sm:px-[22px]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            جاري التحديث…
          </div>
        )}

        {loadError && orders.length === 0 && !loading ? (
          <div role="alert" className="m-4 flex flex-col items-start gap-2 rounded-xl border border-danger-text/30 bg-danger-bg p-4 text-sm text-danger-text sm:m-[22px]">
            <p className="font-bold">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={load}>
              إعادة المحاولة
            </Button>
          </div>
        ) : (
          <div className={cn("p-4 sm:p-[22px]", fetching && "opacity-70")}>
            {/* Mobile (< sm): card rows per `MobileOrders.dc.html`. Desktop: DataTable. */}
            <div className="space-y-3 sm:hidden">
              {!loading && orders.length === 0 && (
                <p className="py-8 text-center text-sm text-ink-soft">
                  {debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
                </p>
              )}
              {orders.map((o) => {
                const next = NEXT_STATUS[o.status];
                return (
                  <div key={o.id} data-row-id={o.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span dir="ltr" className="font-mono text-xs text-ink-soft">#{o.id.slice(0, 8)}</span>
                      <StatusPill variant={ORDER_STATUS_PILL_VARIANT[o.status] ?? "neutral"}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm font-bold text-ink">{o.user?.name ?? o.user?.phone}</p>
                    <p className="text-xs text-ink-soft">
                      {[o.shippingAddress?.area, o.shippingAddress?.governorate].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-extrabold tabular-nums">{egp(o.totalPiastres)}</span>
                      <span className="text-ink-soft">{relativeSince(o.statusSince)}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      {next && (
                        <Button
                          type="button"
                          size="sm"
                          className="flex-1 rounded-lg"
                          disabled={rowUpdating === o.id}
                          onClick={() => advanceRowStatus(o)}
                        >
                          {rowUpdating === o.id ? "جاري…" : STATUS_LABELS[next] ?? next}
                        </Button>
                      )}
                      {isAgent && (
                        <Button asChild type="button" size="sm" variant="outline" className="flex-1 rounded-lg">
                          <Link href={`/partner/orders/${o.id}`}>فتح</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block">
              <DataTable
                columns={columns}
                data={orders}
                getRowId={(o) => o.id}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                getRowProps={(o) => ({ "data-row-id": o.id } as React.HTMLAttributes<HTMLTableRowElement>)}
                onRowClick={isAgent ? (o) => { rememberRow(o.id); router.push(`/partner/orders/${o.id}`); } : undefined}
                loading={loading}
                emptyTitle={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
              />
            </div>
          </div>
        )}

        {total > 0 && (
          <div className="border-t border-stone-200 px-4 py-4 sm:px-[22px]">
            <PaginationBar
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
              pageSizeOptions={[25, 50, 100]}
            />
          </div>
        )}
      </PanelCard>

      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent
          className="rounded-2xl border-stone-200 bg-white"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            bulkTriggerRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>تغيير حالة الطلبات المحددة</DialogTitle>
            <DialogDescription>
              سيتم تحديث حالة {selectedCount} طلب{selectedCount === 1 ? "" : "ات"} إلى الحالة المختارة أدناه.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <label htmlFor="bulk-status-select" className="text-sm font-bold text-ink">
              الحالة الجديدة
            </label>
            <Select id="bulk-status-select" value={bulkTargetStatus} onChange={(e) => setBulkTargetStatus(e.target.value)} className="rounded-lg">
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setBulkDialogOpen(false)} disabled={bulkSubmitting}>
              إلغاء
            </Button>
            <Button type="button" className="rounded-full" onClick={submitBulkStatus} disabled={bulkSubmitting}>
              {bulkSubmitting ? "جاري التحديث…" : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
