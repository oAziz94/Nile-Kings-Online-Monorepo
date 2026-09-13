"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, ChevronDown, Eye, FileDown, RefreshCw, ShoppingBag } from "lucide-react";
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
import {
  ORDER_STATUS_LABELS as STATUS_LABELS,
  ORDER_STATUSES,
} from "@/lib/constants/order-status";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "الدفع عبر InstaPay",
  PAYMOB: "بطاقة",
};

/** Same mapping as `app/(admin)/admin/routed-orders/page.tsx`'s `ROUTED_STATUS_LABELS` —
 * "existing routing-status labels" per backlog 4.19. No shared constants file exists yet
 * for the admin/partner routing surface (admin isn't rebuilt yet), so this mirrors it
 * locally rather than importing across an unrelated page. */
const ROUTED_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "مُعيَّن",
  NOTIFIED: "تم الإشعار",
  ACCEPTED: "مقبول",
  OUT_FOR_DELIVERY: "خارج للتوصيل",
  DELIVERED: "تم التسليم",
  FAILED: "فشل",
};

type PillVariant = NonNullable<BadgeProps["variant"]>;

const ORDER_STATUS_PILL_VARIANT: Record<string, PillVariant> = {
  CREATED: "neutral",
  CONFIRMED: "info",
  PROCESSING: "warning",
  READY_TO_SHIP: "warning",
  SHIPPED: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const ROUTED_STATUS_PILL_VARIANT: Record<string, PillVariant> = {
  ASSIGNED: "neutral",
  NOTIFIED: "info",
  ACCEPTED: "info",
  OUT_FOR_DELIVERY: "warning",
  DELIVERED: "success",
  FAILED: "danger",
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

const NOTE_PREVIEW_MAX = 56;

function ExpandableNotesCell({ notes }: { notes: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  const text = notes?.trim() ?? "";
  if (!text) return <span className="text-xs text-ink-soft">—</span>;
  const needsToggle = text.length > NOTE_PREVIEW_MAX || text.includes("\n");
  return (
    <div className="max-w-[11rem] min-w-[4.5rem]">
      <p
        className={cn(
          "whitespace-pre-wrap break-words text-xs leading-relaxed text-ink/90",
          !expanded && needsToggle && "line-clamp-2 whitespace-normal"
        )}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex items-center gap-0.5 rounded text-[11px] font-bold text-lapis-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          {expanded ? "أقل" : "المزيد"}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

type Order = {
  id: string;
  status: string;
  subtotalPiastres: number;
  shippingPiastres: number;
  codFeePiastres: number;
  totalPiastres: number;
  paymentMethod: string;
  adminNotes: string | null;
  createdAt: string;
  user: { phone: string; name: string | null };
};

type RoutedOrderRow = { orderId: string; status: string };

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
  const [routedOrders, setRoutedOrders] = React.useState<RoutedOrderRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const { search, setSearch, debouncedQ, page, setPage, pageSize, setPageSize, filters, setFilter } =
    useListUrlState({ status: "", variantId: "" });
  const statusFilter = filters.status;
  const setStatusFilter = React.useCallback((value: string) => setFilter("status", value), [setFilter]);
  const variantId = filters.variantId;
  const clearVariantFilter = React.useCallback(() => setFilter("variantId", ""), [setFilter]);

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [exportingShipping, setExportingShipping] = React.useState(false);
  const [rowUpdating, setRowUpdating] = React.useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  // The dialog is opened from a plain button (not a Radix `DialogTrigger`), so focus is restored
  // by hand on close — same pattern as `components/shared/catalog-mobile-filters.tsx`.
  const bulkTriggerRef = React.useRef<HTMLButtonElement>(null);
  const [bulkTargetStatus, setBulkTargetStatus] = React.useState<string>(ORDER_STATUSES[0]);
  const [bulkSubmitting, setBulkSubmitting] = React.useState(false);

  const { rememberRow } = useRowScrollRestore("partner-routed-orders-last-row", orders);

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedQ, statusFilter, variantId, page, pageSize]);

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
    if (variantId) params.set("variantId", variantId);

    try {
      const res = await fetch(`/api/partner/routed-orders?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrders(json.data.orders ?? []);
        setTotal(json.data.total ?? 0);
        setRoutedOrders(json.data.routedOrders ?? []);
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
  }, [debouncedQ, page, pageSize, statusFilter, variantId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const routedStatusByOrderId = React.useMemo(
    () => new Map(routedOrders.map((r) => [r.orderId, r.status])),
    [routedOrders]
  );

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

  const columns = React.useMemo<ColumnDef<Order, unknown>[]>(() => {
    const base: ColumnDef<Order, unknown>[] = [
      {
        id: "id",
        header: "الرقم",
        cell: ({ row }) => <span dir="ltr" className="font-mono text-xs text-ink-soft">{row.original.id.slice(0, 8)}</span>,
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
        id: "total",
        header: "الإجمالي",
        cell: ({ row }) => {
          const o = row.original;
          return (
            <div className="space-y-1 whitespace-nowrap">
              <p className="font-extrabold tabular-nums">{egp(o.totalPiastres)}</p>
              <div className="text-[11px] leading-snug text-ink-soft tabular-nums">
                <p>المجموع الفرعي: {egp(o.subtotalPiastres)}</p>
                <p>الشحن: {egp(o.shippingPiastres)}</p>
                <p>رسوم الدفع عند الاستلام: {egp(o.codFeePiastres)}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: "payment",
        header: "طريقة الدفع",
        cell: ({ row }) => PAYMENT_LABELS[row.original.paymentMethod] ?? row.original.paymentMethod ?? "—",
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => {
          const o = row.original;
          const routedStatus = routedStatusByOrderId.get(o.id);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill variant={ORDER_STATUS_PILL_VARIANT[o.status] ?? "neutral"}>
                {STATUS_LABELS[o.status] ?? o.status}
              </StatusPill>
              {routedStatus && (
                <StatusPill variant={ROUTED_STATUS_PILL_VARIANT[routedStatus] ?? "neutral"}>
                  {ROUTED_STATUS_LABELS[routedStatus] ?? routedStatus}
                </StatusPill>
              )}
            </div>
          );
        },
      },
      {
        id: "notes",
        header: "ملاحظات",
        cell: ({ row }) => <ExpandableNotesCell notes={row.original.adminNotes} />,
      },
      {
        id: "date",
        header: "التاريخ",
        cell: ({ row }) => <span dir="ltr">{formatDateEn(row.original.createdAt)}</span>,
      },
    ];

    if (isAgent) {
      base.push({
        id: "next-status",
        header: "الحالة التالية",
        cell: ({ row }) => {
          const o = row.original;
          const next = NEXT_STATUS[o.status];
          if (!next) return <span className="text-xs text-ink-soft">—</span>;
          return (
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
          );
        },
      });
      base.push({
        id: "open",
        header: "فتح",
        cell: ({ row }) => (
          <Button asChild type="button" size="sm" variant="outline" className="rounded-lg">
            <Link href={`/partner/orders/${row.original.id}`} onClick={(e) => { e.stopPropagation(); rememberRow(row.original.id); }}>
              <Eye className="h-3.5 w-3.5" />
              فتح
            </Link>
          </Button>
        ),
      });
    }

    return base;
  }, [isAgent, routedStatusByOrderId, rowUpdating, advanceRowStatus, rememberRow]);

  const selectedCount = selectedIds.size;

  return (
    <div className="space-y-6">
      <PageHeader
        title="الطلبات"
        description="نفس جدول الطلبات في لوحة الإدارة، لكن مقتصر على الطلبات المسندة لك."
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

      <PanelCard
        title="قائمة الطلبات"
        description="ابحث برقم الطلب أو بيانات العميل أو المنتج."
        icon={<ShoppingBag className="h-5 w-5 text-lapis-800" />}
        toolbar={
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
            <SearchInput value={search} onChange={setSearch} placeholder="بحث برقم الطلب أو العميل…" className="sm:min-w-[16rem] lg:w-64" />
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 w-full rounded-lg sm:w-40">
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            {isAgent && selectedCount > 0 && (
              <Button ref={bulkTriggerRef} type="button" variant="outline" className="rounded-full" onClick={() => setBulkDialogOpen(true)}>
                تغيير حالة المحددة ({selectedCount})
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={handleExportShipping}
              disabled={exportingShipping || selectedCount === 0}
            >
              <FileDown className="h-4 w-4" />
              {exportingShipping ? "جاري التصدير…" : `ملف الشحن (${selectedCount})`}
            </Button>
          </div>
        }
        noPadding
      >
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
            <DataTable
              columns={columns}
              data={orders}
              getRowId={(o) => o.id}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              getRowProps={(o) => ({ "data-row-id": o.id } as React.HTMLAttributes<HTMLTableRowElement>)}
              loading={loading}
              emptyTitle={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
            />
          </div>
        )}

        {total > 0 && (
          <div className="border-t border-stone-200 px-4 py-4 sm:px-[22px]">
            <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={fetching} />
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
