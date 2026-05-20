"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";
import { Select } from "@/components/ui/select";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { AdminSearchInput } from "@/components/admin/admin-search-input";
import { ShoppingBag, FileDown, FileText, Loader2, ChevronDown } from "lucide-react";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  CREATED: "border-slate-300 bg-slate-100 text-slate-700",
  CONFIRMED: "border-blue-300 bg-blue-100 text-blue-700",
  PROCESSING: "border-amber-300 bg-amber-100 text-amber-700",
  READY_TO_SHIP: "border-violet-300 bg-violet-100 text-violet-700",
  SHIPPED: "border-cyan-300 bg-cyan-100 text-cyan-700",
  DELIVERED: "border-emerald-300 bg-emerald-100 text-emerald-700",
  CANCELLED: "border-rose-300 bg-rose-100 text-rose-700",
};

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
  items: { quantity: number; productName: string }[];
};

const NOTE_PREVIEW_MAX = 56;

function ExpandableAdminNotesCell({ notes }: { notes: string | null }) {
  const [expanded, setExpanded] = React.useState(false);
  const text = notes?.trim() ?? "";
  if (!text) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const needsToggle = text.length > NOTE_PREVIEW_MAX || text.includes("\n");
  return (
    <div className="max-w-[11rem] min-w-[4.5rem]">
      <p
        className={cn(
          "text-xs leading-relaxed text-foreground/90 break-words whitespace-pre-wrap",
          !expanded && needsToggle && "line-clamp-2 whitespace-normal"
        )}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-burgundy hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-expanded={expanded}
        >
          {expanded ? "أقل" : "المزيد"}
          <ChevronDown
            className={cn("h-3 w-3 shrink-0 transition-transform duration-200", expanded && "rotate-180")}
            aria-hidden
          />
        </button>
      )}
    </div>
  );
}

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const [selectedOrderIds, setSelectedOrderIds] = React.useState<string[]>([]);
  const [exportingCourier, setExportingCourier] = React.useState(false);
  const [exportingCsv, setExportingCsv] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ, statusFilter]);

  React.useEffect(() => {
    setSelectedOrderIds([]);
  }, [debouncedQ, statusFilter, page, pageSize]);

  React.useEffect(() => {
    const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [total, pageSize, page]);

  React.useEffect(() => {
    const ac = new AbortController();
    setFetching(true);
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String(page * pageSize),
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/admin/orders?${params}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { orders: Order[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data) {
          setOrders(json.data.orders);
          setTotal(json.data.total);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) toast({ title: "فشل تحميل الطلبات", variant: "destructive" });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => ac.abort();
  }, [debouncedQ, statusFilter, page, pageSize, toast]);

  const handleExportCourier = React.useCallback(async () => {
    if (selectedOrderIds.length === 0) {
      toast({
        title: "اختر طلبات للتصدير",
        description: "حدد طلبًا واحدًا على الأقل.",
        variant: "destructive",
      });
      return;
    }
    setExportingCourier(true);
    try {
      const res = await fetch(`/api/admin/orders/courier-export`, {
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
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        `shipments.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير ملف الشحن" });
      setSelectedOrderIds([]);
    } catch (e) {
      toast({
        title: "فشل التصدير",
        description: e instanceof Error ? e.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setExportingCourier(false);
    }
  }, [selectedOrderIds, toast]);

  const handleExportCsv = React.useCallback(async () => {
    if (selectedOrderIds.length === 0) {
      toast({
        title: "اختر طلبات للتصدير",
        description: "حدد طلبًا واحدًا على الأقل.",
        variant: "destructive",
      });
      return;
    }
    setExportingCsv(true);
    try {
      const res = await fetch(`/api/admin/orders/csv-export`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: selectedOrderIds }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast({
          title: "فشل تصدير CSV",
          description: j?.error?.message ?? res.statusText,
          variant: "destructive",
        });
        return;
      }
      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ?? `orders-export.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير CSV" });
      setSelectedOrderIds([]);
    } catch (e) {
      toast({
        title: "فشل تصدير CSV",
        description: e instanceof Error ? e.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setExportingCsv(false);
    }
  }, [selectedOrderIds, toast]);

  const selectedSet = React.useMemo(() => new Set(selectedOrderIds), [selectedOrderIds]);
  const allSelectedOnPage =
    orders.length > 0 && orders.every((o) => selectedSet.has(o.id));

  if (loading && orders.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الطلبات"
        description="عرض الطلبات، التصدير، وتحديث الحالة من صفحة التفاصيل."
      />
      <AdminPanelCard
        title="قائمة الطلبات"
        description="حدّد الطلبات للتصدير أو ابحث بالعميل والمنتج."
        icon={<ShoppingBag className="h-5 w-5 text-burgundy" />}
        toolbar={
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
            <AdminSearchInput
              value={search}
              onChange={setSearch}
              placeholder="بحث برقم الطلب أو العميل…"
              className="sm:min-w-[16rem] lg:w-64"
            />
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 w-full rounded-xl sm:w-40"
            >
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={handleExportCourier}
                disabled={
                  exportingCourier || exportingCsv || selectedOrderIds.length === 0
                }
              >
                <FileDown className="ml-2 h-4 w-4" />
                {exportingCourier
                  ? "جاري التصدير…"
                  : `ملف الشحن (${selectedOrderIds.length})`}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl border-dashed"
                onClick={handleExportCsv}
                disabled={
                  exportingCourier || exportingCsv || selectedOrderIds.length === 0
                }
              >
                <FileText className="ml-2 h-4 w-4" />
                {exportingCsv ? "جاري CSV…" : `CSV (${selectedOrderIds.length})`}
              </Button>
            </div>
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
            <AdminEmptyState
              icon={<ShoppingBag className="h-12 w-12" />}
              title={debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
            />
          ) : orders.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border/60">
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-12">
                    <input
                      type="checkbox"
                      checked={allSelectedOnPage}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const merged = new Set(selectedOrderIds);
                          orders.forEach((o) => merged.add(o.id));
                          setSelectedOrderIds(Array.from(merged));
                          return;
                        }
                        const pageIds = new Set(orders.map((o) => o.id));
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
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedSet.has(o.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOrderIds((prev) => (prev.includes(o.id) ? prev : [...prev, o.id]));
                            return;
                          }
                          setSelectedOrderIds((prev) => prev.filter((id) => id !== o.id));
                        }}
                        aria-label={`تحديد الطلب ${o.id.slice(0, 8)} للتصدير`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{o.id.slice(0, 8)}</TableCell>
                    <TableCell>{o.user?.phone ?? "—"} {o.user?.name ? `(${o.user.name})` : ""}</TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-1 whitespace-nowrap">
                        <p className="font-semibold tabular-nums">{egp(o.totalPiastres)}</p>
                        <div className="text-[11px] leading-snug text-muted-foreground tabular-nums">
                          <p>
                            <span className="text-foreground/70">المجموع الفرعي:</span>{" "}
                            {egp(o.subtotalPiastres)}
                          </p>
                          <p>
                            <span className="text-foreground/70">الشحن:</span> {egp(o.shippingPiastres)}
                          </p>
                          <p>
                            <span className="text-foreground/70">رسوم الدفع عند الاستلام:</span>{" "}
                            {egp(o.codFeePiastres)}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(STATUS_BADGE_CLASSES[o.status] ?? "border-muted")}
                      >
                        {STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top py-3">
                      <ExpandableAdminNotesCell notes={o.adminNotes} />
                    </TableCell>
                    <TableCell>{formatDateEn(o.createdAt)}</TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/orders/${o.id}`}>تفاصيل</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          ) : null}
          {total > 0 && (
            <AdminPaginationBar
              className="mt-6"
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={fetching}
            />
          )}
      </AdminPanelCard>
    </div>
  );
}
