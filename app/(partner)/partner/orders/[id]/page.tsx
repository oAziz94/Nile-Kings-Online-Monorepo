"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, Loader2, MapPin, Package, ShoppingBag, UserRound } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import {
  ORDER_STATUSES,
  ORDER_STATUS_BADGE_CLASSES as STATUS_BADGE_CLASSES,
  ORDER_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/constants/order-status";
import { cn } from "@/lib/utils";

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
  shippingProvider: string;
  paymentMethod: string;
  couponCode: string | null;
  adminNotes: string | null;
  shippingAddress: ShippingAddress;
  shippingOriginGovernorate: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; phone: string; name: string | null; email: string | null };
  items: {
    id: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    quantity: number;
    unitPricePiastres: number;
    totalPiastres: number;
    imageUrl: string | null;
  }[];
};

type EditableItem = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPricePiastres: number;
  quantity: number;
  imageUrl: string | null;
};

type VariantOption = {
  id: string;
  label: string;
  pricePiastres: number;
};

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
  const [updating, setUpdating] = React.useState(false);
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [adminNotes, setAdminNotes] = React.useState("");
  const [editableItems, setEditableItems] = React.useState<EditableItem[]>([]);
  const [savingItems, setSavingItems] = React.useState(false);
  const [variantSearch, setVariantSearch] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<VariantOption[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);

  React.useEffect(() => {
    if (!orderId) return;
    fetch(`/api/partner/orders/${orderId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: OrderDetail }) => {
        if (json?.success && json.data) {
          setOrder(json.data);
          setStatus(json.data.status);
          setAdminNotes(json.data.adminNotes ?? "");
          setEditableItems(
            json.data.items.map((item) => ({
              variantId: item.variantId,
              productName: item.productName,
              variantName: item.variantName,
              unitPricePiastres: item.unitPricePiastres,
              quantity: item.quantity,
              imageUrl: item.imageUrl,
            }))
          );
        }
      })
      .catch(() => toast({ title: "فشل تحميل الطلب", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [orderId, toast]);

  React.useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "20", offset: "0" });
        if (variantSearch.trim()) params.set("q", variantSearch.trim());
        const res = await fetch(`/api/partner/inventory?${params.toString()}`, {
          credentials: "include",
          signal: ac.signal,
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          if (!ac.signal.aborted) setVariantOptions([]);
          return;
        }
        const options: VariantOption[] = (json.data?.products ?? []).flatMap(
          (p: { name: string; variants?: { id: string; name: string; colorName: string | null; pricePiastres: number }[] }) =>
            (p.variants ?? []).map((v) => ({
              id: v.id,
              label: `${p.name} - ${v.name}${v.colorName ? ` - ${v.colorName}` : ""}`,
              pricePiastres: v.pricePiastres,
            }))
        );
        if (!ac.signal.aborted) setVariantOptions(options);
      } catch {
        if (!ac.signal.aborted) setVariantOptions([]);
      }
    }, 300);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [variantSearch]);

  React.useEffect(() => {
    groupItemsByCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableItems]);

  const saveAdminNotes = async () => {
    if (!order) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/partner/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adminNotes: adminNotes.trim() || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrder(json.data);
        setAdminNotes(json.data.adminNotes ?? "");
        toast({ title: "تم حفظ الملاحظات" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  };

  const updateStatus = async () => {
    if (!order || status === order.status) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/partner/orders/${order.id}`, {
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

  const changeItemQty = (variantId: string, nextQty: number) => {
    setEditableItems((prev) =>
      prev.map((item) =>
        item.variantId === variantId
          ? { ...item, quantity: Number.isFinite(nextQty) ? Math.max(1, Math.trunc(nextQty)) : 1 }
          : item
      )
    );
  };

  const removeItem = (variantId: string) => {
    setEditableItems((prev) => prev.filter((item) => item.variantId !== variantId));
  };

  const addSelectedVariant = () => {
    if (!selectedVariantId) return;
    const option = variantOptions.find((o) => o.id === selectedVariantId);
    if (!option) return;
    setEditableItems((prev) => {
      const existing = prev.find((i) => i.variantId === option.id);
      if (existing) {
        return prev.map((i) =>
          i.variantId === option.id ? { ...i, quantity: i.quantity + Math.max(1, Math.trunc(newItemQty || 1)) } : i
        );
      }
      return [
        ...prev,
        {
          variantId: option.id,
          productName: option.label.split(" - ")[0],
          variantName: option.label.replace(`${option.label.split(" - ")[0]} - `, ""),
          unitPricePiastres: option.pricePiastres,
          quantity: Math.max(1, Math.trunc(newItemQty || 1)),
          imageUrl: null,
        },
      ];
    });
    setSelectedVariantId("");
    setNewItemQty(1);
  };

  const saveItems = async () => {
    if (!order) return;
    if (editableItems.length === 0) {
      toast({ title: "لا يمكن حفظ طلب بدون بنود", variant: "destructive" });
      return;
    }
    setSavingItems(true);
    try {
      const res = await fetch(`/api/partner/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: editableItems.map((item) => ({
            variantId: item.variantId,
            quantity: Math.max(1, Math.trunc(item.quantity)),
          })),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setOrder(json.data);
        setEditableItems(
          json.data.items.map((item: OrderDetail["items"][number]) => ({
            variantId: item.variantId,
            productName: item.productName,
            variantName: item.variantName,
            unitPricePiastres: item.unitPricePiastres,
            quantity: item.quantity,
            imageUrl: item.imageUrl,
          }))
        );
        toast({ title: "تم تحديث بنود الطلب وإعادة حساب الإجمالي والشحن" });
      } else {
        toast({ title: json?.error?.message ?? "فشل تحديث البنود", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingItems(false);
    }
  };

  const getSize = (variantName: string) => {
    const parts = variantName.split("-");
    if (parts.length < 2) return variantName;

    const lastPart = parts[parts.length - 1];
    const secondLastPart = parts[parts.length - 2];

    const sizePattern = /^(S|M|L|XL|XXL|XXXL|XS|[0-9]+[a-zA-Z]*|[0-9]+[Xx][0-9]+|[0-9]+\/[0-9]+|one\s*size|free\s*size)$/i;

    const hasArabic = /[؀-ۿ]/.test(lastPart);
    if (hasArabic && secondLastPart) {
      return secondLastPart;
    }

    if (sizePattern.test(lastPart)) {
      return lastPart;
    }

    if (secondLastPart && sizePattern.test(secondLastPart)) {
      return secondLastPart;
    }

    return lastPart;
  };

  const getColor = (variantName: string) => {
    const parts = variantName.split("-");
    const arabicPart = parts.find((part) => /[؀-ۿ]/.test(part));
    return arabicPart || "—";
  };

  const groupItemsByCategory = () => {
    if (!editableItems.length) return;

    const getCategory = (variantName: string) => {
      const parts = variantName.split("-");
      if (parts[0] === "nk" && parts.length > 1) {
        return parts[1];
      }
      return "";
    };

    const sorted = [...editableItems].sort((a, b) => {
      const catA = getCategory(a.variantName);
      const catB = getCategory(b.variantName);
      return catA.localeCompare(catB);
    });

    const isSame = editableItems.every((item, idx) => item.variantId === sorted[idx]?.variantId);
    if (!isSame) {
      setEditableItems(sorted);
    }
  };

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
      <EmptyState
        icon={<ShoppingBag className="h-12 w-12" />}
        title="الطلب غير موجود"
        description="ارجع إلى قائمة الطلبات واختر طلباً آخر."
      />
    );
  }

  const addr = order.shippingAddress ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title={`طلب #${order.id.slice(0, 8)}`}
        badge={
          <Badge variant="outline" className={cn("rounded-md font-normal", STATUS_BADGE_CLASSES[order.status] ?? "")}>
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        }
        actions={
          <Button asChild type="button" variant="outline" className="rounded-md">
            <Link href="/partner/routed-orders">
              <ArrowRight className="h-4 w-4" />
              رجوع للطلبات
            </Link>
          </Button>
        }
      />

      <PanelCard title="الحالة" description="تحديث حالة الطلب." icon={<Package className="h-5 w-5 text-burgundy" />}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label>الحالة</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-48">
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
              ))}
            </Select>
          </div>
          <Button onClick={updateStatus} disabled={updating || status === order.status} className="rounded-md">
            {updating ? "جاري…" : "تحديث الحالة"}
          </Button>
        </div>
      </PanelCard>

      <PanelCard
        title="ملاحظات الطلب"
        description="ملاحظات داخلية للفريق — لا تظهر للعميل ولا تُرسل لشركة الشحن."
        icon={<Package className="h-5 w-5 text-burgundy" />}
      >
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="partner-notes">ملاحظات</Label>
            <textarea
              id="partner-notes"
              rows={3}
              className="flex w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm leading-6 shadow-subtle transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 focus-visible:border-burgundy/40"
              placeholder="أضف ملاحظة عن هذا الطلب…"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md"
            onClick={saveAdminNotes}
            disabled={savingNotes || adminNotes === (order.adminNotes ?? "")}
          >
            {savingNotes ? "جاري…" : "حفظ الملاحظات"}
          </Button>
        </div>
      </PanelCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard title="العميل" icon={<UserRound className="h-5 w-5 text-burgundy" />}>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{order.user?.name ?? "عميل بدون اسم"}</p>
            <p className="text-muted-foreground">{order.user?.phone}</p>
          </div>
        </PanelCard>

        <PanelCard title="عنوان الشحن" icon={<MapPin className="h-5 w-5 text-burgundy" />}>
          <div className="space-y-2 text-sm">
            <p className="font-medium">{addressLines(addr).join("، ") || "لا يوجد عنوان"}</p>
            {addr.notes && (
              <p className="text-muted-foreground">
                <strong>ملاحظات العميل على العنوان:</strong> {addr.notes}
              </p>
            )}
          </div>
        </PanelCard>
      </div>

      <PanelCard title="بنود الطلب" icon={<Package className="h-5 w-5 text-burgundy" />}>
        <TableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج / المتغير</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>السعر الوحدة</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>المقاس</TableHead>
                <TableHead>اللون</TableHead>
                <TableHead>إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editableItems.map((item) => (
                <TableRow key={item.variantId}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="h-12 w-12 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md border bg-muted" />
                      )}
                      <span>{item.productName} – {item.variantName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => changeItemQty(item.variantId, Number(e.target.value))}
                      className="h-9 w-24 rounded-xl border border-input bg-background px-3 text-sm"
                    />
                  </TableCell>
                  <TableCell>{(item.unitPricePiastres / 100).toFixed(0)} ج.م</TableCell>
                  <TableCell>{((item.quantity * item.unitPricePiastres) / 100).toFixed(0)} ج.م</TableCell>
                  <TableCell>
                    {getSize(item.variantName)}
                  </TableCell>
                  <TableCell>
                    {getColor(item.variantName)}
                  </TableCell>
                  <TableCell>
                    <Button variant="destructive" size="sm" onClick={() => removeItem(item.variantId)}>
                      حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableScroll>
        <div className="mt-4 space-y-2 rounded-2xl border p-3">
          <Label>إضافة بند من مخزونك</Label>
          <input
            className="flex h-10 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="ابحث عن منتج"
            value={variantSearch}
            onChange={(e) => setVariantSearch(e.target.value)}
          />
          <div className="flex flex-wrap items-end gap-2">
            <Select value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)} className="min-w-64">
              <option value="">اختر متغيرًا</option>
              {variantOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label} - {(v.pricePiastres / 100).toFixed(0)} ج.م
                </option>
              ))}
            </Select>
            <input
              type="number"
              min={1}
              value={newItemQty}
              onChange={(e) => setNewItemQty(Math.max(1, Number(e.target.value) || 1))}
              className="h-10 w-24 rounded-xl border border-input bg-background px-3 text-sm"
            />
            <Button onClick={addSelectedVariant} disabled={!selectedVariantId}>إضافة</Button>
          </div>
        </div>
        <Button className="mt-4" onClick={saveItems} disabled={savingItems || editableItems.length === 0}>
          {savingItems ? "جاري…" : "حفظ البنود وإعادة الحساب"}
        </Button>
        <div className="mt-4 flex flex-col gap-1 text-sm">
          <p>المجموع الفرعي: {(order.subtotalPiastres / 100).toFixed(0)} ج.م</p>
          {order.discountPiastres + order.seniorFreeValuePiastres > 0 && (
            <p>الخصم: {((order.discountPiastres + order.seniorFreeValuePiastres) / 100).toFixed(0)} ج.م {order.couponCode && `(${order.couponCode})`}</p>
          )}
          <p>الشحن: {(order.shippingPiastres / 100).toFixed(0)} ج.م ({order.shippingProvider})</p>
          {order.codFeePiastres > 0 && <p>رسوم الدفع عند الاستلام: {(order.codFeePiastres / 100).toFixed(0)} ج.م</p>}
          <p className="font-semibold">الإجمالي: {(order.totalPiastres / 100).toFixed(0)} ج.م</p>
        </div>
      </PanelCard>
    </div>
  );
}
