"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Copy,
  Loader2,
  MessageCircle,
  Package,
  Phone,
  Printer,
  ShoppingBag,
  UserRound,
  WifiOff,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { TableScroll } from "@/components/dashboard/table-scroll";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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
  ORDER_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/constants/order-status";
import { computeOrderSla } from "@/lib/orders/order-sla";
import { formatDateEn } from "@/lib/format-en-numbers";
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

type AuditLogEntry = {
  id: string;
  event: string;
  statusFrom: string | null;
  statusTo: string | null;
  createdAt: string;
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
  auditLog: AuditLogEntry[];
  partnerSla: { confirmSlaHours: number; shipSlaHours: number };
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

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; order: OrderDetail }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "network"; message: string };

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

type PillVariant = NonNullable<BadgeProps["variant"]>;

const STATUS_PILL_VARIANT: Record<string, PillVariant> = {
  CREATED: "info",
  CONFIRMED: "warning",
  PROCESSING: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
};

/** CREATED→CONFIRMED→PROCESSING→READY_TO_SHIP→SHIPPED — mirrors the list's next-status map. */
const NEXT_STATUS: Record<string, string | undefined> = {
  CREATED: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "READY_TO_SHIP",
  READY_TO_SHIP: "SHIPPED",
  SHIPPED: undefined,
  DELIVERED: undefined,
  CANCELLED: undefined,
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  created: "تم إنشاء الطلب",
  confirmed: "أكّدته أنت",
  cancelled: "تم إلغاء الطلب",
  status_change: "تغيير الحالة",
};

function auditLabel(entry: AuditLogEntry): string {
  if (entry.event === "status_change" && entry.statusTo) {
    return `${STATUS_LABELS[entry.statusTo] ?? entry.statusTo}`;
  }
  return AUDIT_EVENT_LABELS[entry.event] ?? entry.event;
}

export default function PartnerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { toast } = useToast();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [status, setStatus] = React.useState("");
  const [adminNotes, setAdminNotes] = React.useState("");
  const [editableItems, setEditableItems] = React.useState<EditableItem[]>([]);
  const [updating, setUpdating] = React.useState(false);
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [savingItems, setSavingItems] = React.useState(false);
  const [variantSearch, setVariantSearch] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<VariantOption[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);
  const [showManualStatus, setShowManualStatus] = React.useState(false);

  const hydrateFromOrder = React.useCallback((data: OrderDetail) => {
    setState({ kind: "ready", order: data });
    setStatus(data.status);
    setAdminNotes(data.adminNotes ?? "");
    setEditableItems(
      data.items.map((item) => ({
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        unitPricePiastres: item.unitPricePiastres,
        quantity: item.quantity,
        imageUrl: item.imageUrl,
      }))
    );
  }, []);

  const loadOrder = React.useCallback(async () => {
    if (!orderId) return;
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/partner/orders/${orderId}`, { credentials: "include" });
      const json = await res.json().catch(() => null);
      if (res.status === 403) {
        setState({ kind: "forbidden" });
        return;
      }
      if (res.status === 404 || !json?.success || !json.data) {
        setState({ kind: "not-found" });
        return;
      }
      hydrateFromOrder(json.data as OrderDetail);
    } catch (error) {
      setState({ kind: "network", message: error instanceof Error ? error.message : "تعذر الاتصال بالخادم" });
    }
  }, [orderId, hydrateFromOrder]);

  React.useEffect(() => {
    loadOrder();
  }, [loadOrder]);

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

  const order = state.kind === "ready" ? state.order : null;

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
        hydrateFromOrder(json.data);
        toast({ title: "تم حفظ الملاحظات" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  };

  const applyStatus = React.useCallback(
    async (nextStatus: string) => {
      if (!order || nextStatus === order.status) return;
      setUpdating(true);
      try {
        const res = await fetch(`/api/partner/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          hydrateFromOrder(json.data);
          toast({ title: "تم تحديث الحالة" });
        } else toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      } catch {
        toast({ title: "خطأ في الاتصال", variant: "destructive" });
      } finally {
        setUpdating(false);
      }
    },
    [order, hydrateFromOrder, toast]
  );

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
        hydrateFromOrder(json.data);
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
    if (hasArabic && secondLastPart) return secondLastPart;
    if (sizePattern.test(lastPart)) return lastPart;
    if (secondLastPart && sizePattern.test(secondLastPart)) return secondLastPart;
    return lastPart;
  };

  const getColor = (variantName: string) => {
    const parts = variantName.split("-");
    const arabicPart = parts.find((part) => /[؀-ۿ]/.test(part));
    return arabicPart || "—";
  };

  const copyAddress = React.useCallback(async () => {
    if (!order) return;
    const addr = order.shippingAddress ?? {};
    const text = addressLines(addr).join("، ");
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "تم نسخ العنوان" });
    } catch {
      toast({ title: "تعذر نسخ العنوان", variant: "destructive" });
    }
  }, [order, toast]);

  const BackLink = (
    <Button asChild type="button" variant="outline" className="rounded-full">
      <Link href="/partner/orders">
        <ArrowRight className="h-4 w-4" />
        رجوع للطلبات
      </Link>
    </Button>
  );

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-ink-soft">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل الطلب
      </div>
    );
  }

  if (state.kind === "forbidden") {
    return (
      <div className="space-y-6">
        <PageHeader title="الوصول غير مسموح" actions={BackLink} />
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-danger-text/30 bg-danger-bg p-6 text-danger-text">
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            هذا الطلب متاح للوكلاء فقط
          </p>
          <p className="text-sm">حسابك غير مصرح له بفتح تفاصيل هذا الطلب.</p>
        </div>
      </div>
    );
  }

  if (state.kind === "network") {
    return (
      <div className="space-y-6">
        <PageHeader title="تعذر تحميل الطلب" actions={BackLink} />
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-danger-text/30 bg-danger-bg p-6 text-danger-text">
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <WifiOff className="h-5 w-5 shrink-0" />
            خطأ في الاتصال
          </p>
          <p className="text-sm">{state.message}</p>
          <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={loadOrder}>
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "not-found" || !order) {
    return (
      <div className="space-y-6">
        <PageHeader title="الطلب غير موجود" actions={BackLink} />
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white py-10 text-center">
          <ShoppingBag className="h-10 w-10 text-stone-300" strokeWidth={1.5} />
          <p className="text-[15px] font-extrabold text-ink">الطلب غير موجود</p>
          <p className="max-w-sm text-[13px] text-ink-soft">ارجع إلى قائمة الطلبات واختر طلباً آخر.</p>
        </div>
      </div>
    );
  }

  const addr = order.shippingAddress ?? {};
  const next = NEXT_STATUS[order.status];
  const digitsOnlyPhone = (order.user?.phone ?? "").replace(/[^\d+]/g, "");
  const statusSince = order.auditLog.length > 0 ? order.auditLog[order.auditLog.length - 1].createdAt : order.createdAt;
  const sla = computeOrderSla({ status: order.status, since: new Date(statusSince), partner: order.partnerSla });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`طلب #${order.id.slice(0, 8)}`}
        badge={
          <Badge variant={STATUS_PILL_VARIANT[order.status] ?? "neutral"} className="gap-1.5 rounded-full font-extrabold">
            {STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {BackLink}
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="طباعة"
              onClick={() => window.open(`/partner/orders/pick-list?ids=${order.id}`, "_blank", "noopener")}
            >
              <Printer className="h-4 w-4" />
            </Button>
            {order.status !== "CANCELLED" && order.status !== "DELIVERED" && (
              <Button type="button" variant="outline" className="rounded-full" disabled={updating} onClick={() => applyStatus("CANCELLED")}>
                إلغاء الطلب
              </Button>
            )}
            {next && (
              <Button type="button" className="rounded-full" disabled={updating} onClick={() => applyStatus(next)}>
                {updating ? "جاري…" : STATUS_LABELS[next] ?? next}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <PanelCard title={`القطع (${order.items.length})`} icon={<Package className="h-5 w-5 text-lapis-800" />}>
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead>المقاس · اللون</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>السعر</TableHead>
                    <TableHead>الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold">{item.productName}</TableCell>
                      <TableCell className="text-ink-soft">{getSize(item.variantName)} · {getColor(item.variantName)}</TableCell>
                      <TableCell dir="ltr" className="text-xs text-ink-soft">{item.sku}</TableCell>
                      <TableCell dir="ltr">{item.quantity}</TableCell>
                      <TableCell dir="ltr">{(item.unitPricePiastres / 100).toFixed(0)}</TableCell>
                      <TableCell dir="ltr" className="font-extrabold">{(item.totalPiastres / 100).toFixed(0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
            <div className="mt-4 flex flex-col gap-1 border-t border-stone-100 pt-4 text-sm text-ink">
              <p>المجموع الفرعي: {(order.subtotalPiastres / 100).toFixed(0)} ج.م</p>
              {order.discountPiastres + order.seniorFreeValuePiastres > 0 && (
                <p>الخصم: {((order.discountPiastres + order.seniorFreeValuePiastres) / 100).toFixed(0)} ج.م {order.couponCode && `(${order.couponCode})`}</p>
              )}
              <p>الشحن: {(order.shippingPiastres / 100).toFixed(0)} ج.م ({order.shippingProvider})</p>
              {order.codFeePiastres > 0 && <p>رسوم الدفع عند الاستلام: {(order.codFeePiastres / 100).toFixed(0)} ج.م</p>}
              <p className="font-extrabold">الإجمالي المحصّل: {(order.totalPiastres / 100).toFixed(0)} ج.م</p>
            </div>
          </PanelCard>

          {/* Item-edit + manual status change: preserved feature-parity from the v1 AGENT
              editing screen (`orders.md`), tucked below the read-only summary rather than
              the artboard's static table, since the artboard doesn't model this capability. */}
          <PanelCard title="تعديل بنود الطلب" description="لإضافة أو حذف بند أو تعديل الكمية." icon={<Package className="h-5 w-5 text-lapis-800" />}>
            <TableScroll>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج / المتغير</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editableItems.map((item) => (
                    <TableRow key={item.variantId}>
                      <TableCell>{item.productName} – {item.variantName}</TableCell>
                      <TableCell>
                        <input
                          type="number"
                          min={1}
                          aria-label={`الكمية — ${item.productName}`}
                          value={item.quantity}
                          onChange={(e) => changeItemQty(item.variantId, Number(e.target.value))}
                          className="h-9 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" className="rounded-full" onClick={() => removeItem(item.variantId)}>
                          حذف
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableScroll>
            <div className="mt-4 space-y-2 rounded-xl border border-stone-200 p-3">
              <Label htmlFor="add-item-search">إضافة بند من مخزونك</Label>
              <input
                id="add-item-search"
                className="flex h-10 w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                placeholder="ابحث عن منتج"
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
              />
              <div className="flex flex-wrap items-end gap-2">
                <Select aria-label="اختر متغيرًا" value={selectedVariantId} onChange={(e) => setSelectedVariantId(e.target.value)} className="min-w-64 rounded-lg">
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
                  aria-label="الكمية المضافة"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(Math.max(1, Number(e.target.value) || 1))}
                  className="h-10 w-24 rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                />
                <Button className="rounded-full" onClick={addSelectedVariant} disabled={!selectedVariantId}>إضافة</Button>
              </div>
            </div>
            <Button className="mt-4 rounded-full" onClick={saveItems} disabled={savingItems || editableItems.length === 0}>
              {savingItems ? "جاري…" : "حفظ البنود وإعادة الحساب"}
            </Button>

            <div className="mt-5 border-t border-stone-100 pt-4">
              <button
                type="button"
                onClick={() => setShowManualStatus((v) => !v)}
                className="text-xs font-bold text-lapis-800 underline underline-offset-2"
              >
                {showManualStatus ? "إخفاء تغيير الحالة يدويًا" : "تغيير الحالة يدويًا"}
              </button>
              {showManualStatus && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="grid gap-2">
                    <Label>الحالة</Label>
                    <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg sm:w-48">
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </Select>
                  </div>
                  <Button onClick={() => applyStatus(status)} disabled={updating || status === order.status} className="rounded-full">
                    {updating ? "جاري…" : "تحديث الحالة"}
                  </Button>
                </div>
              )}
            </div>
          </PanelCard>

          <PanelCard title="ملاحظاتك الداخلية" description="ملاحظات داخلية للفريق — لا تظهر للعميل ولا تُرسل لشركة الشحن." icon={<Package className="h-5 w-5 text-lapis-800" />}>
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="partner-notes">ملاحظات</Label>
                <textarea
                  id="partner-notes"
                  rows={3}
                  className="flex w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-ink placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  placeholder="أضف ملاحظة عن هذا الطلب…"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={saveAdminNotes}
                disabled={savingNotes || adminNotes === (order.adminNotes ?? "")}
              >
                {savingNotes ? "جاري…" : "حفظ الملاحظات"}
              </Button>
            </div>
          </PanelCard>
        </div>

        <div className="space-y-4">
          <PanelCard title="العميل والتوصيل" icon={<UserRound className="h-5 w-5 text-lapis-800" />}>
            <div className="space-y-2 text-sm">
              <p className="font-extrabold text-ink">{order.user?.name ?? "عميل بدون اسم"}</p>
              <p dir="ltr" className="text-right text-ink-soft">{order.user?.phone}</p>
              <p className="leading-relaxed text-ink">{addressLines(addr).join("، ") || "لا يوجد عنوان"}</p>
              {addr.notes && (
                <p className="text-ink-soft">
                  <strong className="text-ink">ملاحظة العميل: </strong>{addr.notes}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
                  <a href={`tel:${digitsOnlyPhone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    اتصال
                  </a>
                </Button>
                <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
                  <a href={`https://wa.me/${digitsOnlyPhone.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-3.5 w-3.5" />
                    واتساب
                  </a>
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={copyAddress}>
                  <Copy className="h-3.5 w-3.5" />
                  نسخ العنوان
                </Button>
              </div>
            </div>
          </PanelCard>

          <PanelCard title="سجل الطلب" icon={<Clock className="h-5 w-5 text-lapis-800" />}>
            <ol className="space-y-0">
              {order.auditLog.length === 0 && <p className="text-sm text-ink-soft">لا توجد أحداث مسجلة بعد.</p>}
              {order.auditLog.map((entry, idx) => (
                <li key={entry.id} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-malachite-text" />
                    {idx < order.auditLog.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-stone-100" />}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-ink">{auditLabel(entry)}</p>
                    <p className="text-xs text-ink-soft">{formatDateEn(entry.createdAt, { hour: "numeric", minute: "2-digit" })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </PanelCard>

          {sla.applicable && (
            <div
              className={cn(
                "flex items-start gap-2.5 rounded-2xl p-4 text-[12px] leading-relaxed",
                sla.overdue ? "bg-danger-bg text-danger-text" : "bg-gold-50 text-ink"
              )}
            >
              <Clock className="h-[18px] w-[18px] shrink-0" />
              {sla.overdue ? (
                <p><b>متأخر:</b> تجاوز هذا الطلب مهلة {sla.hours} ساعة المحددة في إعداداتك.</p>
              ) : (
                <p><b>{order.status === "CREATED" ? "مهلة التأكيد" : "مهلة الشحن"}:</b> يتبقى {Math.max(0, Math.ceil(sla.remainingHours))} ساعة قبل أن يُعدّ هذا الطلب متأخرًا وفق إعداداتك ({sla.hours} ساعة).</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
