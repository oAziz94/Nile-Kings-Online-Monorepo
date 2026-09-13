"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowRight,
  Link2,
  Loader2,
  MessageCircleQuestion,
  Package,
  Phone,
  Truck,
  Upload,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/constants/order-status";
import { getOrderTicketStatusLabel } from "@/lib/constants/order-ticket";
import { computeOrderSla, type OrderSlaResult } from "@/lib/orders/order-sla";
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
};

type SavedAddress = {
  id: string;
  label: string | null;
  governorate: string;
  city: string | null;
  area: string | null;
  street: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  notes: string | null;
  phone: string;
  isDefault: boolean;
};

type ClientSummary = { id: string; phone: string; name: string | null };
type ClientDetails = ClientSummary & { savedAddresses: SavedAddress[] };

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
  cancellationReason: string | null;
  createdAt: string;
  shippingAddress: ShippingAddress;
  user: { id: string; phone: string; name: string | null };
  ticket: { id: string; status: "OPEN" | "ANSWERED" | "CLOSED" } | null;
  assignedPartner: { id: string; name: string; phone: string; confirmSlaHours: number; shipSlaHours: number } | null;
  routedOrder: {
    id: string;
    status: string;
    assignmentMode: string;
    assignedAt: string;
    proofImageUrl: string | null;
    proofImagePublicId: string | null;
  } | null;
  auditLog: OrderAuditLogEntry[];
  items: {
    id: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    categorySlug: string;
    quantity: number;
    unitPricePiastres: number;
    totalPiastres: number;
    imageUrl: string | null;
  }[];
};

type PartnerOption = { id: string; name: string; phone: string };

type TicketMessage = { id: string; authorRole: "CUSTOMER" | "ADMIN"; body: string; createdAt: string };
type TicketThread = {
  id: string;
  status: "OPEN" | "ANSWERED" | "CLOSED";
  contactPhone: string;
  messages: TicketMessage[];
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

const NEXT_STATUS: Record<string, string | undefined> = {
  CREATED: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "READY_TO_SHIP",
  READY_TO_SHIP: "SHIPPED",
  SHIPPED: undefined,
  DELIVERED: undefined,
  CANCELLED: undefined,
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { toast } = useToast();

  const [order, setOrder] = React.useState<OrderDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState("");
  const [updating, setUpdating] = React.useState(false);
  const [adminNotes, setAdminNotes] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);

  const [editableItems, setEditableItems] = React.useState<EditableOrderItem[]>([]);
  const [savingItems, setSavingItems] = React.useState(false);
  const [variantSearch, setVariantSearch] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<OrderVariantOption[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);

  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState("");
  const [cancelling, setCancelling] = React.useState(false);

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignPartnerId, setAssignPartnerId] = React.useState("");
  const [assignNotes, setAssignNotes] = React.useState("");
  const [assignSubmitting, setAssignSubmitting] = React.useState(false);
  const [partners, setPartners] = React.useState<PartnerOption[]>([]);

  const [proofUploading, setProofUploading] = React.useState(false);
  const proofInputRef = React.useRef<HTMLInputElement>(null);

  // Client re-link ("ربط الطلب بحساب عميل") — v1 feature-parity, admin-only, not shared
  // with the partner detail (`docs/redesign/00-feature-inventory/admin/orders.md`).
  const [clientSearch, setClientSearch] = React.useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = React.useState("");
  const [clientOptions, setClientOptions] = React.useState<ClientSummary[]>([]);
  const [loadingClients, setLoadingClients] = React.useState(false);
  const [selectedClientId, setSelectedClientId] = React.useState("");
  const [selectedAddressId, setSelectedAddressId] = React.useState("");
  const [selectedClient, setSelectedClient] = React.useState<ClientDetails | null>(null);
  const [loadingSelectedClient, setLoadingSelectedClient] = React.useState(false);
  const [linking, setLinking] = React.useState(false);

  const [ticket, setTicket] = React.useState<TicketThread | null>(null);
  const [ticketReply, setTicketReply] = React.useState("");
  const [ticketSending, setTicketSending] = React.useState(false);
  const [ticketToggling, setTicketToggling] = React.useState(false);

  const hydrate = React.useCallback((data: OrderDetail) => {
    setOrder(data);
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
    setSelectedClientId(data.user.id);
    setClientOptions((prev) => (prev.some((c) => c.id === data.user.id) ? prev : [{ id: data.user.id, phone: data.user.phone, name: data.user.name }, ...prev]));
  }, []);

  const load = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/admin/orders/${id}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success && json.data) {
        hydrate(json.data);
        setLoadError(null);
      } else {
        setLoadError(json?.error?.message ?? "فشل تحميل الطلب");
      }
    } catch {
      setLoadError("فشل تحميل الطلب");
    } finally {
      setLoading(false);
    }
  }, [id, hydrate]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [clientSearch]);

  React.useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ limit: "20", offset: "0" });
    if (debouncedClientSearch) params.set("q", debouncedClientSearch);
    setLoadingClients(true);
    fetch(`/api/admin/clients?${params.toString()}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { clients?: ClientSummary[] } }) => {
        if (ac.signal.aborted) return;
        if (json?.success) setClientOptions(json.data?.clients ?? []);
      })
      .catch(() => { if (!ac.signal.aborted) setClientOptions([]); })
      .finally(() => { if (!ac.signal.aborted) setLoadingClients(false); });
    return () => ac.abort();
  }, [debouncedClientSearch]);

  React.useEffect(() => {
    if (!selectedClientId) {
      setSelectedClient(null);
      setSelectedAddressId("");
      return;
    }
    setSelectedClient(null);
    setSelectedAddressId("");
    setLoadingSelectedClient(true);
    const ac = new AbortController();
    fetch(`/api/admin/clients/${selectedClientId}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: ClientDetails }) => {
        if (ac.signal.aborted) return;
        if (json?.success && json.data) setSelectedClient(json.data);
      })
      .catch(() => { if (!ac.signal.aborted) setSelectedClient(null); })
      .finally(() => { if (!ac.signal.aborted) setLoadingSelectedClient(false); });
    return () => ac.abort();
  }, [selectedClientId]);

  React.useEffect(() => {
    if (!selectedClient) return;
    const addresses = selectedClient.savedAddresses;
    if (!addresses.length) {
      setSelectedAddressId("");
      return;
    }
    setSelectedAddressId((prev) => {
      if (prev && addresses.some((a) => a.id === prev)) return prev;
      const addressFromOrder = order?.shippingAddress as { savedAddressId?: string } | undefined;
      if (order && selectedClient.id === order.user.id && addressFromOrder?.savedAddressId) {
        const found = addresses.find((a) => a.id === addressFromOrder.savedAddressId);
        if (found) return found.id;
      }
      const preferred = addresses.find((a) => a.isDefault) ?? addresses[0];
      return preferred.id;
    });
  }, [selectedClient, order]);

  React.useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "20", offset: "0", active: "true" });
        if (variantSearch.trim()) params.set("q", variantSearch.trim());
        const res = await fetch(`/api/admin/products?${params.toString()}`, { credentials: "include", signal: ac.signal });
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
    return () => { ac.abort(); clearTimeout(t); };
  }, [variantSearch]);

  React.useEffect(() => {
    if (!assignOpen) return;
    Promise.all([
      fetch("/api/admin/partners?partnerType=AGENT&limit=200", { credentials: "include" }).then((r) => r.json()),
      fetch("/api/admin/partners?partnerType=DISTRIBUTOR&limit=200", { credentials: "include" }).then((r) => r.json()),
    ]).then(([a, b]) => {
      const list: PartnerOption[] = [...(a?.data?.partners ?? []), ...(b?.data?.partners ?? [])]
        .filter((p: { isActive?: boolean }) => p.isActive !== false)
        .map((p: { id: string; name: string; phone: string }) => ({ id: p.id, name: p.name, phone: p.phone }));
      setPartners(list);
    });
  }, [assignOpen]);

  const loadTicket = React.useCallback(async () => {
    if (!order?.ticket) return;
    const res = await fetch(`/api/admin/order-tickets/${order.ticket.id}`, { credentials: "include" });
    const json = await res.json();
    if (res.ok && json?.success) setTicket(json.data);
  }, [order?.ticket]);

  React.useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  const applyStatus = React.useCallback(
    async (nextStatus: string) => {
      if (!order || nextStatus === order.status) return;
      setUpdating(true);
      try {
        const res = await fetch(`/api/admin/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          hydrate(json.data);
          toast({ title: "تم تحديث الحالة" });
        } else toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      } catch {
        toast({ title: "خطأ في الاتصال", variant: "destructive" });
      } finally {
        setUpdating(false);
      }
    },
    [order, id, hydrate, toast]
  );

  const submitCancel = React.useCallback(async () => {
    if (cancelReason.trim().length < 3) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "CANCELLED", cancellationReason: cancelReason.trim() }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        hydrate(json.data);
        setCancelOpen(false);
        setCancelReason("");
        toast({ title: "تم إلغاء الطلب" });
      } else toast({ title: json?.error?.message ?? "فشل الإلغاء", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  }, [id, cancelReason, hydrate, toast]);

  const saveAdminNotes = React.useCallback(async () => {
    if (!order || adminNotes === (order.adminNotes ?? "")) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ adminNotes: adminNotes.trim() || null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        hydrate(json.data);
        toast({ title: "تم حفظ الملاحظات" });
      } else toast({ title: json?.error?.message ?? "فشل", variant: "destructive" });
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSavingNotes(false);
    }
  }, [order, adminNotes, id, hydrate, toast]);

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
    if (editableItems.length === 0) {
      toast({ title: "لا يمكن حفظ طلب بدون بنود", variant: "destructive" });
      return;
    }
    setSavingItems(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          items: editableItems.map((item) => ({ variantId: item.variantId, quantity: Math.max(1, Math.trunc(item.quantity)) })),
        }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        hydrate(json.data);
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

  const updateLinkedAccount = async () => {
    if (!selectedClientId || !selectedAddressId) return;
    setLinking(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: selectedClientId, savedAddressId: selectedAddressId }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        hydrate(json.data);
        toast({ title: "تم تحديث الحساب والعنوان المرتبطين بالطلب" });
      } else {
        toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setLinking(false);
    }
  };

  const submitAssign = React.useCallback(async () => {
    if (!assignPartnerId) return;
    setAssignSubmitting(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId: assignPartnerId, notes: assignNotes.trim() || undefined }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setAssignOpen(false);
        setAssignPartnerId("");
        setAssignNotes("");
        await load();
        toast({ title: "تم الإسناد" });
      } else {
        toast({ title: json?.error?.message ?? "فشل الإسناد", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setAssignSubmitting(false);
    }
  }, [id, assignPartnerId, assignNotes, load, toast]);

  const handleProofFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const type = file.type.toLowerCase();
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(type)) {
      toast({ title: "نوع الملف غير مدعوم. استخدم JPG أو PNG أو WebP", variant: "destructive" });
      return;
    }
    setProofUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buf).reduce((acc, byte) => acc + String.fromCharCode(byte), ""));
      const uploadRes = await fetch("/api/admin/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ image: `data:${file.type};base64,${base64}`, contentType: file.type, folder: "routed-proofs" }),
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok || !uploadJson?.data?.url) {
        toast({ title: uploadJson?.error?.message ?? "فشل الرفع", variant: "destructive" });
        return;
      }
      const res = await fetch(`/api/admin/orders/${id}/proof`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ proofImageUrl: uploadJson.data.url, proofImagePublicId: uploadJson.data.publicId ?? null }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        await load();
        toast({ title: "تم حفظ إثبات التسليم" });
      } else {
        toast({ title: json?.error?.message ?? "فشل الحفظ", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setProofUploading(false);
      e.target.value = "";
    }
  };

  const sendTicketReply = React.useCallback(async () => {
    if (!order?.ticket || ticketReply.trim().length < 1) return;
    setTicketSending(true);
    try {
      const res = await fetch(`/api/admin/order-tickets/${order.ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: ticketReply.trim() }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setTicket(json.data);
        setTicketReply("");
        await load();
        toast({ title: "تم إرسال الرد" });
      } else {
        toast({ title: json?.error?.message ?? "تعذر إرسال الرد", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذر إرسال الرد", variant: "destructive" });
    } finally {
      setTicketSending(false);
    }
  }, [order?.ticket, ticketReply, load, toast]);

  const closeTicket = React.useCallback(async () => {
    if (!order?.ticket) return;
    setTicketToggling(true);
    try {
      const res = await fetch(`/api/admin/order-tickets/${order.ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "CLOSED" }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setTicket(json.data);
        await load();
        toast({ title: "تم إغلاق السؤال" });
      }
    } finally {
      setTicketToggling(false);
    }
  }, [order?.ticket, load, toast]);

  if (loading || !order) {
    if (loadError) {
      return (
        <div role="alert" className="rounded-2xl border border-danger-text/30 bg-danger-bg p-4 text-sm text-danger-text">
          <p className="font-bold">{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 rounded-lg" onClick={load}>إعادة المحاولة</Button>
        </div>
      );
    }
    return (
      <div className="flex min-h-[24rem] items-center justify-center text-sm text-ink-soft">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
        جاري تحميل الطلب
      </div>
    );
  }

  const addr = order.shippingAddress ?? {};
  const next = NEXT_STATUS[order.status];
  const canCancel = order.status !== "CANCELLED" && order.status !== "DELIVERED";
  const partnerSla: OrderSlaResult | null = order.assignedPartner
    ? computeOrderSla({
        status: order.status,
        since: new Date(order.routedOrder?.assignedAt ?? order.createdAt),
        partner: { confirmSlaHours: order.assignedPartner.confirmSlaHours, shipSlaHours: order.assignedPartner.shipSlaHours },
      })
    : null;

  const BackLink = (
    <Button type="button" variant="outline" className="rounded-full" onClick={() => router.back()}>
      <ArrowRight className="h-4 w-4" />
      رجوع للطلبات
    </Button>
  );

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
            {order.ticket && (
              <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
                <Link href={`/admin/order-tickets/${order.ticket.id}`}>
                  <MessageCircleQuestion className="h-3.5 w-3.5" />
                  سؤال العميل · {getOrderTicketStatusLabel(order.ticket.status)}
                </Link>
              </Button>
            )}
            <OrderHeaderActions
              status={order.status}
              printHref={`/admin/orders/picking?ids=${order.id}`}
              onCancel={canCancel ? () => setCancelOpen(true) : undefined}
              cancelLabel="إلغاء الطلب…"
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

          {order.ticket && (
            <PanelCard title="سؤال العميل" icon={<MessageCircleQuestion className="h-5 w-5 text-lapis-800" />}>
              <div className="space-y-3">
                <Badge variant={order.ticket.status === "OPEN" ? "warning" : order.ticket.status === "ANSWERED" ? "success" : "neutral"} className="rounded-full">
                  {getOrderTicketStatusLabel(order.ticket.status)}
                </Badge>
                <div className="max-h-64 space-y-2.5 overflow-y-auto">
                  {(ticket?.messages ?? []).map((m) => (
                    <div key={m.id} className="rounded-xl border border-stone-200 bg-ground p-3 text-[13px] leading-relaxed">
                      <p className="mb-1 text-xs text-ink-soft">{m.authorRole === "CUSTOMER" ? "العميل" : "أنت"}</p>
                      <p className="whitespace-pre-wrap text-ink">{m.body}</p>
                    </div>
                  ))}
                </div>
                <textarea
                  rows={3}
                  value={ticketReply}
                  onChange={(e) => setTicketReply(e.target.value)}
                  placeholder="اكتب ردًا يراه العميل تحت طلبه…"
                  className="w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-ink placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" className="rounded-full" onClick={sendTicketReply} disabled={ticketSending || ticketReply.trim().length === 0}>
                    {ticketSending ? "جاري…" : "إرسال الرد"}
                  </Button>
                  {order.ticket.status !== "CLOSED" && (
                    <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={closeTicket} disabled={ticketToggling}>
                      إغلاق السؤال
                    </Button>
                  )}
                </div>
              </div>
            </PanelCard>
          )}

          <PanelCard title="ملاحظات داخلية" description="ملاحظات داخلية للفريق — لا تظهر للعميل ولا تُرسل لشركة الشحن." icon={<Package className="h-5 w-5 text-lapis-800" />}>
            <div className="grid gap-2">
              <Label htmlFor="admin-order-notes">ملاحظات</Label>
              <textarea
                id="admin-order-notes"
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                onBlur={saveAdminNotes}
                placeholder="أضف ملاحظة عن هذا الطلب…"
                className="flex w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-ink placeholder:text-ink-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              />
              {savingNotes && <p className="text-xs text-ink-soft">جاري الحفظ…</p>}
            </div>
          </PanelCard>

          <PanelCard title="ربط الطلب بحساب عميل" description="يمكنك تغيير الحساب المرتبط بالطلب ثم اختيار عنوان من عناوين هذا الحساب." icon={<Link2 className="h-5 w-5 text-lapis-800" />}>
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label>بحث عن عميل</Label>
                <input
                  className="flex h-10 w-full rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                  placeholder="ابحث بالهاتف أو الاسم"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>الحساب</Label>
                <Select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full rounded-lg">
                  {!selectedClientId && <option value="">اختر حسابًا</option>}
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.phone} {c.name ? `(${c.name})` : ""}</option>
                  ))}
                </Select>
                {loadingClients && <p className="text-xs text-ink-soft">جاري تحميل العملاء…</p>}
              </div>
              <div className="grid gap-2">
                <Label>عنوان الحساب</Label>
                <Select
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                  disabled={loadingSelectedClient || !selectedClient || selectedClient.savedAddresses.length === 0}
                  className="w-full rounded-lg"
                >
                  {!selectedAddressId && <option value="">اختر عنوانًا</option>}
                  {(selectedClient?.savedAddresses ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label ? `${a.label} - ` : ""}{a.governorate} {a.city ? `، ${a.city}` : ""} {a.area ? `، ${a.area}` : ""} - {a.street}
                    </option>
                  ))}
                </Select>
                {selectedClient && selectedClient.savedAddresses.length === 0 && (
                  <p className="text-xs text-danger-text">هذا الحساب لا يملك عناوين محفوظة.</p>
                )}
              </div>
              <Button className="rounded-full" onClick={updateLinkedAccount} disabled={linking || !selectedClientId || !selectedAddressId}>
                {linking ? "جاري…" : "تحديث الحساب والعنوان"}
              </Button>
            </div>
          </PanelCard>
        </div>

        <div className="space-y-4">
          <PanelCard title="الشريك المنفّذ" icon={<Truck className="h-5 w-5 text-lapis-800" />}>
            {order.assignedPartner ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-extrabold text-ink">{order.assignedPartner.name}</p>
                  <p dir="ltr" className="text-xs text-ink-soft">{order.assignedPartner.phone}</p>
                  {partnerSla?.applicable && (
                    <p className="mt-1 text-xs text-ink-soft">
                      {partnerSla.overdue ? "متأخر" : "في الموعد"}
                    </p>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-ink-soft">
                  المخزون محجوز عند هذا الشريك. إعادة الإسناد تنقل الحجز إلى الشريك الجديد وتكتب قيدًا في دفتر المخزون لكليهما.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => setAssignOpen(true)}>
                    إعادة الإسناد…
                  </Button>
                  <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
                    <a href={`tel:${order.assignedPartner.phone.replace(/[^\d+]/g, "")}`}>
                      <Phone className="h-3.5 w-3.5" />
                      اتصال بالشريك
                    </a>
                  </Button>
                </div>
                <div className="border-t border-stone-100 pt-3">
                  <p className="mb-2 text-xs font-bold text-ink">إثبات التسليم</p>
                  {order.routedOrder?.proofImageUrl && (
                    <a href={order.routedOrder.proofImageUrl} target="_blank" rel="noopener noreferrer" className="mb-2 block">
                      <img src={order.routedOrder.proofImageUrl} alt="إثبات التسليم" className="h-24 w-24 rounded-lg border border-stone-200 object-cover" />
                    </a>
                  )}
                  <input ref={proofInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="hidden" onChange={handleProofFile} disabled={proofUploading} />
                  <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => proofInputRef.current?.click()} disabled={proofUploading}>
                    <Upload className="h-3.5 w-3.5" />
                    {proofUploading ? "جاري الرفع…" : "إثبات التسليم"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-soft">لا يوجد شريك مسند لهذا الطلب.</p>
                <Button type="button" size="sm" className="rounded-full" onClick={() => setAssignOpen(true)}>
                  إسناد…
                </Button>
              </div>
            )}
          </PanelCard>

          <OrderCustomerCard
            name={order.user?.name ?? null}
            phone={order.user?.phone ?? ""}
            addressLines={addressLines(addr)}
            addressNote={addr.notes ?? null}
            onCopyAddress={async () => {
              try {
                await navigator.clipboard.writeText(addressLines(addr).join("، "));
                toast({ title: "تم نسخ العنوان" });
              } catch {
                toast({ title: "تعذر نسخ العنوان", variant: "destructive" });
              }
            }}
            extraActions={
              <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
                <Link href={`/admin/clients/${order.user.id}`}>
                  <UserRound className="h-3.5 w-3.5" />
                  ملف العميل
                </Link>
              </Button>
            }
          />

          <OrderTimeline auditLog={order.auditLog} sla={partnerSla} awaitingConfirmLabel={order.status === "CREATED"} />
        </div>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl border-stone-200 bg-white">
          <DialogHeader>
            <DialogTitle>إلغاء الطلب</DialogTitle>
            <DialogDescription>اكتب سببًا للإلغاء (٣ أحرف على الأقل) — يُحفظ في سجل الطلب.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="cancel-reason">السبب</Label>
            <textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full resize-none rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm leading-6 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              تراجع
            </Button>
            <Button type="button" variant="destructive" className="rounded-full" onClick={submitCancel} disabled={cancelling || cancelReason.trim().length < 3}>
              {cancelling ? "جاري الإلغاء…" : "تأكيد الإلغاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="rounded-2xl border-stone-200 bg-white">
          <DialogHeader>
            <DialogTitle>{order.assignedPartner ? "إعادة الإسناد" : "إسناد إلى شريك"}</DialogTitle>
            <DialogDescription>
              {order.assignedPartner
                ? "سيُنقل حجز المخزون إلى الشريك الجديد، وسيُكتب قيد في دفتر المخزون لكلا الشريكين."
                : "سيُحجز المخزون عند الشريك المختار."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="detail-assign-partner">الشريك</Label>
              <Select id="detail-assign-partner" value={assignPartnerId} onChange={(e) => setAssignPartnerId(e.target.value)} className="rounded-lg">
                <option value="">اختر شريكًا</option>
                {partners.filter((p) => p.id !== order.assignedPartner?.id).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="detail-assign-notes">ملاحظة (اختياري)</Label>
              <input
                id="detail-assign-notes"
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setAssignOpen(false)} disabled={assignSubmitting}>
              إلغاء
            </Button>
            <Button type="button" className="rounded-full" onClick={submitAssign} disabled={assignSubmitting || !assignPartnerId}>
              {assignSubmitting ? "جاري…" : "تأكيد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
