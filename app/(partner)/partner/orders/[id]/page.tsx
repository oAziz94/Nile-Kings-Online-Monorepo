"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Loader2, MapPin, Package, RefreshCw, Save, ShoppingBag, UserRound } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPanelCard } from "@/components/admin/admin-panel-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { piastresToEgp } from "@/lib/catalog";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

const ORDER_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

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

type ShippingAddress = {
  governorate?: string;
  city?: string | null;
  area?: string | null;
  street?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone?: string | null;
  label?: string | null;
};

type OrderDetail = {
  id: string;
  status: string;
  subtotalPiastres: number;
  discountPiastres: number;
  seniorFreeValuePiastres: number;
  shippingPiastres: number;
  codFeePiastres: number;
  totalPiastres: number;
  paymentMethod: string;
  adminNotes: string | null;
  shippingAddress: ShippingAddress;
  shippingProvider: string;
  shippingOriginGovernorate: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; phone: string; name: string | null; email: string | null };
  items: {
    id: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPricePiastres: number;
    totalPiastres: number;
    imageUrl: string | null;
  }[];
};

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

function addressLines(address: ShippingAddress) {
  return [
    address.governorate,
    address.city,
    address.area,
    address.street,
    address.building ? `مبنى ${address.building}` : null,
    address.floor ? `دور ${address.floor}` : null,
    address.apartment ? `شقة ${address.apartment}` : null,
  ].filter(Boolean);
}

export default function PartnerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { toast } = useToast();
  const [order, setOrder] = React.useState<OrderDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fetching, setFetching] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [adminNotes, setAdminNotes] = React.useState("");

  const load = React.useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch(`/api/partner/orders/${orderId}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        const row = json.data as OrderDetail;
        setOrder(row);
        setStatus(row.status);
        setAdminNotes(row.adminNotes ?? "");
      } else {
        toast({ title: json?.error?.message ?? "فشل تحميل الطلب", variant: "destructive" });
      }
    } catch (error) {
      toast({
        title: "فشل تحميل الطلب",
        description: error instanceof Error ? error.message : "خطأ غير متوقع",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, [orderId, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function saveChanges() {
    if (!order) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/partner/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status, adminNotes }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        const row = json.data as OrderDetail;
        setOrder(row);
        setStatus(row.status);
        setAdminNotes(row.adminNotes ?? "");
        toast({ title: "تم حفظ الطلب" });
      } else {
        toast({ title: json?.error?.message ?? "فشل حفظ الطلب", variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل الطلب
      </div>
    );
  }

  if (!order) {
    return (
      <AdminEmptyState
        icon={<ShoppingBag className="h-12 w-12" />}
        title="الطلب غير موجود"
        description="ارجع إلى قائمة الطلبات واختر طلباً آخر."
      />
    );
  }

  const dirty = status !== order.status || adminNotes !== (order.adminNotes ?? "");
  const address = order.shippingAddress ?? {};

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={`طلب #${order.id.slice(0, 8)}`}
        description={`تم الإنشاء ${formatDateEn(order.createdAt)} · ${PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}`}
        badge={
          <Badge variant="outline" className={cn("rounded-md font-normal", STATUS_BADGE_CLASSES[order.status] ?? "")}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        }
        actions={
          <>
            <Button asChild type="button" variant="outline" className="rounded-md">
              <Link href="/partner/routed-orders">
                <ArrowRight className="h-4 w-4" />
                رجوع للطلبات
              </Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-md" onClick={load} disabled={fetching}>
              <RefreshCw className={cn("h-4 w-4", fetching && "animate-spin")} />
              تحديث
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <AdminPanelCard
          title="تعديل حالة الطلب والملاحظات"
          description="يمكن للوكيل تعديل حالة الطلب والملاحظات الداخلية فقط."
          icon={<Save className="h-5 w-5 text-burgundy" />}
        >
          <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">حالة الطلب</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {ORDER_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">ملاحظات الطلب</span>
              <textarea
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                rows={4}
                className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" className="rounded-md" disabled={!dirty || saving} onClick={saveChanges}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التعديلات
            </Button>
          </div>
        </AdminPanelCard>

        <AdminPanelCard title="ملخص الطلب" icon={<ShoppingBag className="h-5 w-5 text-burgundy" />}>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">المجموع الفرعي</span>
              <span>{egp(order.subtotalPiastres)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">الخصومات</span>
              <span>{egp(order.discountPiastres + order.seniorFreeValuePiastres)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">الشحن</span>
              <span>{egp(order.shippingPiastres)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">رسوم COD</span>
              <span>{egp(order.codFeePiastres)}</span>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-3 text-base font-bold">
              <span>الإجمالي</span>
              <span>{egp(order.totalPiastres)}</span>
            </div>
          </div>
        </AdminPanelCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminPanelCard title="بيانات العميل" icon={<UserRound className="h-5 w-5 text-burgundy" />}>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{order.user.name ?? "عميل بدون اسم"}</p>
            <p className="text-muted-foreground">{order.user.phone}</p>
            {order.user.email && <p className="text-muted-foreground">{order.user.email}</p>}
          </div>
        </AdminPanelCard>

        <AdminPanelCard title="عنوان الشحن" icon={<MapPin className="h-5 w-5 text-burgundy" />}>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{addressLines(address).join("، ") || "لا يوجد عنوان"}</p>
            {address.phone && <p className="text-muted-foreground">هاتف الشحن: {address.phone}</p>}
            {address.notes && <p className="whitespace-pre-wrap text-muted-foreground">{address.notes}</p>}
            {order.shippingOriginGovernorate && (
              <p className="text-xs text-muted-foreground">مصدر الشحن: {order.shippingOriginGovernorate}</p>
            )}
          </div>
        </AdminPanelCard>
      </div>

      <AdminPanelCard title="بنود الطلب" icon={<Package className="h-5 w-5 text-burgundy" />}>
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead>الصورة</TableHead>
                <TableHead>المنتج</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-center">الكمية</TableHead>
                <TableHead>سعر الوحدة</TableHead>
                <TableHead>الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.variantName}
                        className="h-12 w-12 rounded-md border border-border object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-border bg-muted text-muted-foreground">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="min-w-44">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.variantName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">{formatNumberEn(item.quantity)}</Badge>
                  </TableCell>
                  <TableCell>{egp(item.unitPricePiastres)}</TableCell>
                  <TableCell className="font-semibold">{egp(item.totalPiastres)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </AdminPanelCard>
    </div>
  );
}
