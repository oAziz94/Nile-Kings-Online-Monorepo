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
import { Truck, Search, Loader2 } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const ROUTED_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "مُعيَّن",
  NOTIFIED: "تم الإشعار",
  ACCEPTED: "مقبول",
  OUT_FOR_DELIVERY: "خارج للتوصيل",
  DELIVERED: "تم التسليم",
  FAILED: "فشل",
  CANCELLED: "ملغي",
  UNROUTED: "غير موجه",
};

const MODE_LABELS: Record<string, string> = {
  AUTO: "تلقائي",
  MANUAL: "يدوي",
};

type RoutedOrderRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  governorate: string;
  status: string;
  assignmentMode: string;
  assignedAt: string;
  proofImageUrl: string | null;
  customerName: string | null;
  partner: { id: string; name: string; phone: string; partnerType: string } | null;
};

export default function AdminRoutedOrdersPage() {
  const [rows, setRows] = React.useState<RoutedOrderRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);
  const { toast } = useToast();

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  React.useEffect(() => {
    setPage(0);
  }, [debouncedQ, statusFilter]);

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
    if (statusFilter) params.set("status", statusFilter);
    if (debouncedQ) params.set("q", debouncedQ);
    fetch(`/api/admin/routed-orders?${params}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { routedOrders: RoutedOrderRow[]; total: number } }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data) {
          setRows(json.data.routedOrders);
          setTotal(json.data.total);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) toast({ title: "فشل تحميل الطلبات الموجهة", variant: "destructive" });
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
          setFetching(false);
        }
      });
    return () => ac.abort();
  }, [debouncedQ, statusFilter, page, pageSize, toast]);

  if (loading && rows.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الطلبات الموجهة</h1>
      <Card>
        <CardHeader className="flex flex-col gap-4 space-y-0 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>قائمة الطلبات الموجهة</CardTitle>
            <CardDescription>عرض الطلبات المُوجّهة للشركاء وتحديث الحالة وإثبات التسليم من صفحة التفاصيل.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
            <div className="relative w-full min-w-[200px] sm:max-w-xs">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الطلب أو اسم العميل…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full sm:w-40">
              <option value="">كل الحالات</option>
              {Object.entries(ROUTED_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {fetching && rows.length > 0 && (
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري التحديث…
            </div>
          )}
          {rows.length === 0 && !fetching ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Truck className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">
                {debouncedQ ? "لا توجد نتائج للبحث" : "لا توجد طلبات موجهة"}
              </p>
            </div>
          ) : rows.length > 0 ? (
            <Table className={cn(fetching && "opacity-70")}>
              <TableHeader>
                <TableRow>
                  <TableHead>رقم الطلب</TableHead>
                  <TableHead>العميل</TableHead>
                  <TableHead>المحافظة</TableHead>
                  <TableHead>الشريك</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>طريقة التعيين</TableHead>
                  <TableHead>تاريخ التعيين</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>إثبات</TableHead>
                  <TableHead className="text-left">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">#{r.orderNumber}</TableCell>
                    <TableCell>{r.customerName ?? "—"} </TableCell>
                    <TableCell>{r.governorate}</TableCell>
                    <TableCell>{r.partner?.name ?? "—"}</TableCell>
                    <TableCell>{r.partner ? (r.partner.partnerType === "AGENT" ? "وكيل" : "موزع") : "—"}</TableCell>
                    <TableCell>{MODE_LABELS[r.assignmentMode] ?? r.assignmentMode}</TableCell>
                    <TableCell>{formatDateEn(r.assignedAt)}</TableCell>
                    <TableCell><Badge variant="outline">{ROUTED_STATUS_LABELS[r.status] ?? r.status}</Badge></TableCell>
                    <TableCell>{r.proofImageUrl ? "✓" : "—"}</TableCell>
                    <TableCell className="text-left">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/routed-orders/${r.id}`}>تفاصيل</Link>
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
