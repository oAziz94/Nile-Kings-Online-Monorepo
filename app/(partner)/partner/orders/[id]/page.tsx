"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Package,
  ShoppingBag,
  WifiOff,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/constants/order-status";
import { computeOrderSla } from "@/lib/orders/order-sla";
import {
  OrderItemsTable,
  type EditableOrderItem,
  type OrderVariantOption,
} from "@/components/orders/order-items-table";
import { OrderCustomerCard } from "@/components/orders/order-customer-card";
import { OrderTimeline, type OrderAuditLogEntry } from "@/components/orders/order-timeline";
import { OrderHeaderActions, ManualStatusMenu } from "@/components/orders/order-status-actions";

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
  auditLog: OrderAuditLogEntry[];
  partnerSla: { confirmSlaHours: number; shipSlaHours: number };
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
  ].filter(Boolean) as string[];
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

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; order: OrderDetail }
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "network"; message: string };

export default function PartnerOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const { toast } = useToast();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [status, setStatus] = React.useState("");
  const [adminNotes, setAdminNotes] = React.useState("");
  const [editableItems, setEditableItems] = React.useState<EditableOrderItem[]>([]);
  const [updating, setUpdating] = React.useState(false);
  const [savingNotes, setSavingNotes] = React.useState(false);
  const [savingItems, setSavingItems] = React.useState(false);
  const [variantSearch, setVariantSearch] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<OrderVariantOption[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);

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
        const options: OrderVariantOption[] = (json.data?.products ?? []).flatMap(
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
            <OrderHeaderActions
              status={order.status}
              printHref={`/partner/orders/pick-list?ids=${order.id}`}
              onCancel={() => applyStatus("CANCELLED")}
              cancelling={updating}
              next={next ? { value: next, label: STATUS_LABELS[next] ?? next } : null}
              onAdvance={applyStatus}
              updating={updating}
            />
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <OrderItemsTable
            items={order.items}
            money={{
              subtotalPiastres: order.subtotalPiastres,
              discountPiastres: order.discountPiastres,
              seniorFreeValuePiastres: order.seniorFreeValuePiastres,
              shippingPiastres: order.shippingPiastres,
              shippingProvider: order.shippingProvider,
              codFeePiastres: order.codFeePiastres,
              totalPiastres: order.totalPiastres,
              couponCode: order.couponCode,
            }}
            editableItems={editableItems}
            onChangeQty={changeItemQty}
            onRemoveItem={removeItem}
            variantSearch={variantSearch}
            onVariantSearchChange={setVariantSearch}
            variantOptions={variantOptions}
            selectedVariantId={selectedVariantId}
            onSelectVariant={setSelectedVariantId}
            newItemQty={newItemQty}
            onNewItemQtyChange={setNewItemQty}
            onAddSelectedVariant={addSelectedVariant}
            onSaveItems={saveItems}
            savingItems={savingItems}
            belowSaveButton={
              <ManualStatusMenu
                currentStatus={order.status}
                value={status}
                onChange={setStatus}
                statuses={ORDER_STATUSES}
                statusLabels={STATUS_LABELS}
                onApply={() => applyStatus(status)}
                updating={updating}
              />
            }
          />

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
          <OrderCustomerCard
            name={order.user?.name ?? null}
            phone={order.user?.phone ?? ""}
            addressLines={addressLines(addr)}
            addressNote={addr.notes ?? null}
            onCopyAddress={copyAddress}
          />

          <OrderTimeline auditLog={order.auditLog} sla={sla} awaitingConfirmLabel={order.status === "CREATED"} />
        </div>
      </div>
    </div>
  );
}
