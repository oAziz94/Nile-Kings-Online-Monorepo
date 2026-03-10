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
import { ShoppingBag } from "lucide-react";
import { formatDateEn } from "@/lib/format-en-numbers";

const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

type Order = {
  id: string;
  status: string;
  totalPiastres: number;
  createdAt: string;
  user: { phone: string; name: string | null };
  items: { quantity: number; productName: string }[];
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
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

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  return (
    <div dir="rtl" className="space-y-6">
      <h1 className="text-2xl font-bold">الطلبات</h1>
      <Card>
        <CardHeader>
          <CardTitle>قائمة الطلبات</CardTitle>
          <CardDescription>عرض تفاصيل الطلب وتحديث الحالة من صفحة التفاصيل.</CardDescription>
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
