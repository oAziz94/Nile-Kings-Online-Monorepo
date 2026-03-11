"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/shared/skeleton";

const STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

type Order = {
  id: string;
  status: string;
  subtotalPiastres: number;
  discountPiastres: number;
  shippingPiastres: number;
  codFeePiastres: number;
  totalPiastres: number;
  shippingProvider: string;
  paymentMethod: string;
  couponCode: string | null;
  createdAt: string;
  shippingAddress: Record<string, unknown>;
  user: { phone: string; name: string | null };
  items: { productName: string; variantName: string; quantity: number; unitPricePiastres: number; totalPiastres: number }[];
};

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();
  const [order, setOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [status, setStatus] = React.useState("");

  React.useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/orders/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Order }) => {
        if (json?.success && json.data) {
          setOrder(json.data);
          setStatus(json.data.status);
        }
      })
      .catch(() => toast({ title: "فشل تحميل الطلب", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  const updateStatus = async () => {
    if (!order || status === order.status) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrder(json.data);
        toast({ title: "تم تحديث الحالة" });
      } else toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };

  if (loading || !order) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const addr = order.shippingAddress as Record<string, string> | undefined;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/orders">← الطلبات</Link>
        </Button>
        <h1 className="text-2xl font-bold">طلب #{order.id.slice(0, 8)}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الحالة</CardTitle>
          <CardDescription>تحديث حالة الطلب.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label>الحالة</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <Button onClick={updateStatus} disabled={updating || status === order.status}>
            {updating ? "جاري…" : "تحديث الحالة"}
          </Button>
          <Badge variant="outline" className="mr-2">{STATUS_LABELS[order.status] ?? order.status}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>العميل والعنوان</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p><strong>الهاتف:</strong> {order.user?.phone}</p>
          {order.user?.name && <p><strong>الاسم:</strong> {order.user.name}</p>}
          {addr && (
            <p className="text-muted-foreground">
              {addr.governorate} {addr.city ? `، ${addr.city}` : ""} {addr.area ? `، ${addr.area}` : ""} – {addr.street}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>البنود</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج / المتغير</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>السعر الوحدة</TableHead>
                <TableHead>الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.productName} – {item.variantName}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{(item.unitPricePiastres / 100).toFixed(0)} ج.م</TableCell>
                  <TableCell>{(item.totalPiastres / 100).toFixed(0)} ج.م</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 flex flex-col gap-1 text-sm">
            <p>المجموع الفرعي: {(order.subtotalPiastres / 100).toFixed(0)} ج.م</p>
            {order.discountPiastres > 0 && <p>الخصم: {(order.discountPiastres / 100).toFixed(0)} ج.م {order.couponCode && `(${order.couponCode})`}</p>}
            <p>الشحن: {(order.shippingPiastres / 100).toFixed(0)} ج.م ({order.shippingProvider})</p>
            {order.codFeePiastres > 0 && <p>رسوم الدفع عند الاستلام: {(order.codFeePiastres / 100).toFixed(0)} ج.م</p>}
            <p className="font-semibold">الإجمالي: {(order.totalPiastres / 100).toFixed(0)} ج.م</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
