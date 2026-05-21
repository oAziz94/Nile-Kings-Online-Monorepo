"use client";

import * as React from "react";
import { useParams } from "next/navigation";
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
import { AdminTableScroll } from "@/components/admin/admin-table-scroll";

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
  adminNotes: string | null;
  createdAt: string;
  shippingAddress: Record<string, unknown>;
  user: { id: string; phone: string; name: string | null };
  items: { variantId: string; productName: string; variantName: string; quantity: number; unitPricePiastres: number; totalPiastres: number; imageUrl: string | null }[];
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

type ClientSummary = {
  id: string;
  phone: string;
  name: string | null;
};

type ClientDetails = ClientSummary & {
  savedAddresses: SavedAddress[];
};
type EditableItem = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPricePiastres: number;
  quantity: number;
  imageUrl: string | null;
};
type ProductVariantOption = {
  id: string;
  label: string;
  pricePiastres: number;
};

export default function AdminOrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const [order, setOrder] = React.useState<Order | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [updating, setUpdating] = React.useState(false);
  const [linking, setLinking] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [clientSearch, setClientSearch] = React.useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = React.useState("");
  const [clientOptions, setClientOptions] = React.useState<ClientSummary[]>([]);
  const [loadingClients, setLoadingClients] = React.useState(false);
  const [loadingSelectedClient, setLoadingSelectedClient] = React.useState(false);
  const [selectedClientId, setSelectedClientId] = React.useState("");
  const [selectedAddressId, setSelectedAddressId] = React.useState("");
  const [selectedClient, setSelectedClient] = React.useState<ClientDetails | null>(null);
  const [editableItems, setEditableItems] = React.useState<EditableItem[]>([]);
  const [savingItems, setSavingItems] = React.useState(false);
  const [variantSearch, setVariantSearch] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<ProductVariantOption[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);
  const [adminNotes, setAdminNotes] = React.useState("");
  const [savingNotes, setSavingNotes] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [clientSearch]);

  React.useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/orders/${id}`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: Order }) => {
        if (json?.success && json.data) {
          setOrder(json.data);
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
          setStatus(json.data.status);
          setAdminNotes(json.data.adminNotes ?? "");
          setSelectedClientId(json.data.user.id);
          setClientOptions((prev) =>
            prev.some((c) => c.id === json.data!.user.id)
              ? prev
              : [{ id: json.data!.user.id, phone: json.data!.user.phone, name: json.data!.user.name }, ...prev]
          );
        }
      })
      .catch(() => toast({ title: "فشل تحميل الطلب", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [id, toast]);

  React.useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "20", offset: "0" });
        if (variantSearch.trim()) params.set("q", variantSearch.trim());
        const res = await fetch(`/api/admin/products?${params.toString()}`, {
          credentials: "include",
          signal: ac.signal,
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          if (!ac.signal.aborted) setVariantOptions([]);
          return;
        }
        const options: ProductVariantOption[] = (json.data?.products ?? []).flatMap(
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
      .catch(() => {
        if (!ac.signal.aborted) setClientOptions([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingClients(false);
      });
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
      .catch(() => {
        if (!ac.signal.aborted) setSelectedClient(null);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingSelectedClient(false);
      });
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

  const saveAdminNotes = async () => {
    if (!order) return;
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

  const updateLinkedAccount = async () => {
    if (!order || !selectedClientId || !selectedAddressId) return;
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
        setOrder(json.data);
        setSelectedClientId(json.data.user.id);
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
          json.data.items.map((item: Order["items"][number]) => ({
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

  if (loading || !order) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const addr = order.shippingAddress as Record<string, string> | undefined;

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" size="sm" asChild className="self-start">
          <Link href="/admin/orders">← الطلبات</Link>
        </Button>
        <h1 className="text-xl font-bold sm:text-2xl">طلب #{order.id.slice(0, 8)}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>الحالة</CardTitle>
          <CardDescription>تحديث حالة الطلب.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="grid gap-2">
            <Label>الحالة</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full sm:w-48">
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
          <CardTitle>ملاحظات الإدارة</CardTitle>
          <CardDescription>ملاحظات داخلية للفريق — لا تظهر للعميل ولا تُرسل لشركة الشحن.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="admin-notes">ملاحظات</Label>
            <textarea
              id="admin-notes"
              className="flex min-h-[100px] w-full max-w-lg rounded-2xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="أضف ملاحظة عن هذا الطلب…"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={saveAdminNotes}
            disabled={savingNotes || adminNotes === (order.adminNotes ?? "")}
          >
            {savingNotes ? "جاري…" : "حفظ الملاحظات"}
          </Button>
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
          {addr?.notes && (
            <p className="text-sm text-muted-foreground">
              <strong>ملاحظات العميل على العنوان:</strong> {addr.notes}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ربط الطلب بحساب عميل</CardTitle>
          <CardDescription>يمكنك تغيير الحساب المرتبط بالطلب ثم اختيار عنوان من عناوين هذا الحساب.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>بحث عن عميل</Label>
            <input
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-4 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="ابحث بالهاتف أو الاسم"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>الحساب</Label>
            <Select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} className="w-full">
              {!selectedClientId && <option value="">اختر حسابًا</option>}
              {order && !clientOptions.some((c) => c.id === order.user.id) && selectedClientId === order.user.id && (
                <option value={order.user.id}>
                  {order.user.phone} {order.user.name ? `(${order.user.name})` : ""}
                </option>
              )}
              {selectedClient && !clientOptions.some((c) => c.id === selectedClient.id) && (
                <option value={selectedClient.id}>
                  {selectedClient.phone} {selectedClient.name ? `(${selectedClient.name})` : ""}
                </option>
              )}
              {clientOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.phone} {c.name ? `(${c.name})` : ""}
                </option>
              ))}
            </Select>
            {loadingClients && <p className="text-xs text-muted-foreground">جاري تحميل العملاء…</p>}
          </div>

          <div className="grid gap-2">
            <Label>عنوان الحساب</Label>
            <Select
              value={selectedAddressId}
              onChange={(e) => setSelectedAddressId(e.target.value)}
              disabled={loadingSelectedClient || !selectedClient || selectedClient.savedAddresses.length === 0}
              className="w-full"
            >
              {!selectedAddressId && <option value="">اختر عنوانًا</option>}
              {(selectedClient?.savedAddresses ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label ? `${a.label} - ` : ""}{a.governorate} {a.city ? `، ${a.city}` : ""} {a.area ? `، ${a.area}` : ""} - {a.street}
                </option>
              ))}
            </Select>
            {selectedClient && selectedClient.savedAddresses.length === 0 && (
              <p className="text-xs text-destructive">هذا الحساب لا يملك عناوين محفوظة.</p>
            )}
            {loadingSelectedClient && <p className="text-xs text-muted-foreground">جاري تحميل عناوين الحساب…</p>}
          </div>

          <Button onClick={updateLinkedAccount} disabled={linking || !selectedClientId || !selectedAddressId}>
            {linking ? "جاري…" : "تحديث الحساب والعنوان"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>البنود</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTableScroll>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج / المتغير</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>السعر الوحدة</TableHead>
                <TableHead>الإجمالي</TableHead>
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
                    <Button variant="destructive" size="sm" onClick={() => removeItem(item.variantId)}>
                      حذف
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </AdminTableScroll>
          <div className="mt-4 space-y-2 rounded-2xl border p-3">
            <Label>إضافة بند</Label>
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
