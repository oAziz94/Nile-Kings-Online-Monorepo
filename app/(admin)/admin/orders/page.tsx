"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AdminPaginationBar } from "@/components/admin/admin-pagination";
import { ShoppingBag, FileDown, FileText, Search, Loader2 } from "lucide-react";
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
  createdAt: string;
  user: { phone: string; name: string | null };
  items: { quantity: number; productName: string }[];
};

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
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الطلبات</h1>
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>قائمة الطلبات</CardTitle>
            <CardDescription>عرض تفاصيل الطلب وتحديث الحالة من صفحة التفاصيل.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:max-w-md sm:flex-row sm:items-center sm:justify-end">
            <div className="relative w-full sm:min-w-[240px]">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الطلب أو اسم العميل أو الهاتف…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-40"
            >
              <option value="">كل الحالات</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleExportCourier}
                disabled={
                  exportingCourier || exportingCsv || selectedOrderIds.length === 0
                }
              >
                <FileDown className="ml-2 h-4 w-4" />
                {exportingCourier
                  ? "جاري التصدير…"
                  : `تصدير ملف الشحن (${selectedOrderIds.length})`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleExportCsv}
                disabled={
                  exportingCourier || exportingCsv || selectedOrderIds.length === 0
                }
              >
                <FileText className="ml-2 h-4 w-4" />
                {exportingCsv
                  ? "جاري تصدير CSV…"
                  : `تصدير CSV (${selectedOrderIds.length})`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {fetching && orders.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {orders.length === 0 && !fetching ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">
                {debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات"}
              </p>
            </div>
          ) : orders.length > 0 ? (
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow>
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
        </CardContent>
      </Card>
    </div>
  );
}
