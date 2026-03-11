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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShoppingBag, FileDown } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "الدفع عبر InstaPay",
  PAYMOB: "بطاقة",
};

type Order = {
  id: string;
  status: string;
  totalPiastres: number;
  paymentMethod: string;
  createdAt: string;
  user: { phone: string; name: string | null };
  items: { quantity: number; productName: string }[];
};

function toYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportDate, setExportDate] = React.useState(() => toYYYYMMDD(new Date()));
  const [exporting, setExporting] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    fetch("/api/admin/orders?limit=50", { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { orders: Order[]; total: number } }) => {
        if (json?.success && json.data) {
          setOrders(json.data.orders);
          setTotal(json.data.total);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الطلبات", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const handleExportCourier = React.useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/orders/courier-export?date=${encodeURIComponent(exportDate)}`,
        { credentials: "include" }
      );
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
        `shipments_${exportDate.replace(/-/g, "_")}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "تم تصدير ملف الشحن" });
      setExportOpen(false);
    } catch (e) {
      toast({
        title: "فشل التصدير",
        description: e instanceof Error ? e.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  }, [exportDate, toast]);

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الطلبات</h1>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>قائمة الطلبات</CardTitle>
            <CardDescription>عرض تفاصيل الطلب وتحديث الحالة من صفحة التفاصيل.</CardDescription>
          </div>
          <Dialog open={exportOpen} onOpenChange={setExportOpen}>
            <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
              <FileDown className="ml-2 h-4 w-4" />
              تصدير ملف الشحن
            </Button>
            <DialogContent onClose={() => setExportOpen(false)}>
              <DialogHeader>
                <DialogTitle>تصدير ملف الشحن</DialogTitle>
                <DialogDescription>
                  اختر تاريخ الشحن. سيتم تصدير الطلبات ذات الحالة «جاهز للشحن» والتي لم تُصدَر من قبل في هذا التاريخ.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="export-date">تاريخ التصدير</Label>
                  <Input
                    id="export-date"
                    type="date"
                    value={exportDate}
                    onChange={(e) => setExportDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setExportOpen(false)}
                  disabled={exporting}
                >
                  إلغاء
                </Button>
                <Button type="button" onClick={handleExportCourier} disabled={exporting}>
                  {exporting ? "جاري التصدير…" : "تحميل XLSX"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">لا توجد طلبات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
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
                    <TableCell className="font-mono text-sm">{o.id.slice(0, 8)}</TableCell>
                    <TableCell>{o.user?.phone ?? "—"} {o.user?.name ? `(${o.user.name})` : ""}</TableCell>
                    <TableCell>{(o.totalPiastres / 100).toFixed(0)} ج.م</TableCell>
                    <TableCell>{PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{STATUS_LABELS[o.status] ?? o.status}</Badge></TableCell>
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
          )}
          {total > orders.length && (
            <p className="text-sm text-muted-foreground mt-4">عرض {orders.length} من {total}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
