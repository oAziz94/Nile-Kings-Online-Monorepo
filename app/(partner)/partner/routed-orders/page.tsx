"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Eye, FileDown, FileText, Loader2, RefreshCw, ShoppingBag } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination";
import { PanelCard } from "@/components/dashboard/panel-card";
import { SearchInput } from "@/components/dashboard/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useListUrlState } from "@/hooks/use-list-url-state";
import { useRowScrollRestore } from "@/hooks/use-row-scroll-restore";
import { piastresToEgp } from "@/lib/catalog";
import {
  ORDER_STATUS_BADGE_CLASSES as STATUS_BADGE_CLASSES,
  ORDER_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/constants/order-status";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "الدفع عبر InstaPay",
  PAYMOB: "بطاقة",
};

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
  items: { quantity: number; productName: string; variantName: string; totalPiastres: number }[];
  routedOrder: { id: string; status: string; assignedAt: string } | null;
};

const NOTE_PREVIEW_MAX = 56;

function ExpandableNotesCell({ notes }: { notes: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  const text = notes?.trim() ?? "";
  if (!text) return <span className="text-xs text-muted-foreground">—</span>;
  const needsToggle = text.length > NOTE_PREVIEW_MAX || text.includes("\n");
  return (
    <div className="max-w-[11rem] min-w-[4.5rem]">
      <p
        className={cn(
          "break-words whitespace-pre-wrap text-xs leading-relaxed text-foreground/90",
          !expanded && needsToggle && "line-clamp-2 whitespace-normal"
        )}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-burgundy hover:underline"
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

export default function PartnerOrdersPage() {
  return (
    <React.Suspense fallback={null}>
      <PartnerOrdersPageInner />
    </React.Suspense>
  );
}

function PartnerOrdersPageInner() {
  const { toast } = useToast();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const {
    search,
    setSearch,
    debouncedQ,
    page,
    setPage,
    pageSize,
    setPageSize,
    filters,
    setFilter,
  } = useListUrlState({ status: "" });
  const statusFilter = filters.status;
  const setStatusFilter = React.useCallback(
    (value: string) => setFilter("status", value),
    [setFilter]
  );
  const [partnerType, setPartnerType] = React.useState<"AGENT" | "DISTRIBUTOR" | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<string[]>([]);
  const [exportingShipping, setExportingShipping] = React.useState(false);
  const { rememberRow } = useRowScrollRestore("partner-routed-orders-last-row", orders);

  React.useEffect(() => {
    setSelectedOrderIds([]);
  }, [debouncedQ, statusFilter, page, pageSize]);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/partner/me", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        const type = json?.data?.partner?.partnerType;
        if (alive && (type === "AGENT" || type === "DISTRIBUTOR")) setPartnerType(type);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (loading) return; // total isn't known yet on first render — don't clamp against a stale 0
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [loading, page, pageSize, total, setPage]);

  const load = React.useCallback(async () => {
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (statusFilter) params.set("status", statusFilter);

    try {
      const res = await fetch(`/api/partner/routed-orders?${params}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrders(json.data.orders ?? []);
        setTotal(json.data.total ?? 0);
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل الطلبات", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل الطلبات",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [debouncedQ, page, pageSize, statusFilter, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const handleExportShipping = React.useCallback(async () => {
    if (selectedOrderIds.length === 0) {
      toast({
        title: "اختر طلبات للتصدير",
        description: "حدد طلبًا واحدًا على الأقل.",
        variant: "destructive",
      });
      return;
    }
    setExportingShipping(true);
    try {
      const res = await fetch(`/api/partner/routed-orders/export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          title: "فشل التصدير",
          description: j?.error?.message ?? res.statusText,
          variant: "destructive",
        });
        return;
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? `shipments.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير ملف الشحن" });
      setSelectedOrderIds([]);
    } catch (error) {
      toast({
        title: "فشل التصدير",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setExportingShipping(false);
    }
  }, [selectedOrderIds, toast]);

  const selectedSet = React.useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const allSelectedOnPage = orders.length > 0 && orders.every((order) => selectedSet.has(order.id));

  if (loading && orders.length === 0) {
    return <div className="h-64 rounded-2xl bg-muted/40" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="الطلبات"
        description="نفس جدول الطلبات في لوحة الإدارة، لكن مقتصر على الطلبات المسندة لك."
        actions={
          <Button type="button" variant="outline" className="rounded-xl" onClick={load} disabled={fetching}>
            <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
            تحديث
          </Button>
        }
      />

      <PanelCard
        title="قائمة الطلبات"
        description="ابحث برقم الطلب أو بيانات العميل أو المنتج."
        icon={<ShoppingBag className="h-5 w-5 text-burgundy" />}
        toolbar={
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="بحث برقم الطلب أو العميل…"
              className="sm:min-w-[16rem] lg:w-64"
            />
            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full rounded-xl sm:w-40"
            >
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={handleExportShipping}
              disabled={exportingShipping || selectedOrderIds.length === 0}
            >
              <FileDown className="ml-2 h-4 w-4" />
              {exportingShipping ? "جاري التصدير…" : `ملف الشحن (${selectedOrderIds.length})`}
            </Button>
          </div>
        }
      >
        {fetching && orders.length > 0 && (
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التحديث…
          </div>
        )}
        {orders.length === 0 && !fetching ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={(event) => {
                        if (event.target.checked) {
                          const merged = new Set(selectedOrderIds);
                          orders.forEach((order) => merged.add(order.id));
                          setSelectedOrderIds(Array.from(merged));
                          return;
                        }
                        const pageIds = new Set(orders.map((order) => order.id));
                        setSelectedOrderIds((prev) => prev.filter((id) => !pageIds.has(id)));
                      }}
                      aria-label="تحديد كل الطلبات في هذه الصفحة"
                      disabled={orders.length === 0}
                    />
                  </TableHead>
                  <TableHead>الرقم</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>طريقة الدفع</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="min-w-[5.5rem] max-w-[12rem]">ملاحظات</TableHead>
                  <TableHead>التاريخ</TableHead>
                  {partnerType === "AGENT" && <TableHead className="text-left">فتح</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} data-row-id={order.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(order.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedOrderIds((prev) => (prev.includes(order.id) ? prev : [...prev, order.id]));
                            return;
                          }
                          setSelectedOrderIds((prev) => prev.filter((id) => id !== order.id));
                        }}
                        aria-label={`تحديد الطلب ${order.id.slice(0, 8)} للتصدير`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{order.id.slice(0, 8)}</TableCell>
                    <TableCell>
                      {order.user?.phone ?? "—"} {order.user?.name ? `(${order.user.name})` : ""}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 whitespace-nowrap">
                        <p className="font-semibold tabular-nums">{egp(order.totalPiastres)}</p>
                        <div className="text-[11px] leading-snug text-muted-foreground tabular-nums">
                          <p>
                            <span className="text-foreground/70">المجموع الفرعي:</span>{" "}
                            {egp(order.subtotalPiastres)}
                          </p>
                          <p>
                            <span className="text-foreground/70">الشحن:</span> {egp(order.shippingPiastres)}
                          </p>
                          <p>
                            <span className="text-foreground/70">رسوم الدفع عند الاستلام:</span>{" "}
                            {egp(order.codFeePiastres)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(STATUS_BADGE_CLASSES[order.status] ?? "border-muted")}
                      >
                        {STATUS_LABELS[order.status] ?? order.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <ExpandableNotesCell notes={order.adminNotes} />
                    </TableCell>
                    <TableCell>{formatDateEn(order.createdAt)}</TableCell>
                    {partnerType === "AGENT" && (
                      <TableCell className="text-left">
                        <Button asChild type="button" size="sm" variant="outline" className="rounded-md">
                          <Link href={`/partner/orders/${order.id}`} onClick={() => rememberRow(order.id)}>
                            <Eye className="h-4 w-4" />
                            فتح
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {total > 0 && (
          <PaginationBar
            className="mt-6"
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            disabled={fetching}
          />
        )}
      </PanelCard>
    </div>
  );
}
