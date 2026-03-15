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
import { Select } from "@/components/ui/select";
import { Truck } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";

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
  const [statusFilter, setStatusFilter] = React.useState("");
  const { toast } = useToast();

  const fetchList = React.useCallback(() => {
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/admin/routed-orders?${params}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { routedOrders: RoutedOrderRow[]; total: number } }) => {
        if (json?.success && json.data) {
          setRows(json.data.routedOrders);
          setTotal(json.data.total);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الطلبات الموجهة", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [statusFilter, toast]);

  React.useEffect(() => {
    setLoading(true);
    fetchList();
  }, [fetchList]);

  if (loading && rows.length === 0) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الطلبات الموجهة</h1>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>قائمة الطلبات الموجهة</CardTitle>
            <CardDescription>عرض الطلبات المُوجّهة للشركاء وتحديث الحالة وإثبات التسليم من صفحة التفاصيل.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40">
              <option value="">كل الحالات</option>
              {Object.entries(ROUTED_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <Truck className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">لا توجد طلبات موجهة</p>
            </div>
          ) : (
            <Table>
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
          )}
          {total > rows.length && (
            <p className="text-sm text-muted-foreground mt-4">عرض {rows.length} من {total}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
