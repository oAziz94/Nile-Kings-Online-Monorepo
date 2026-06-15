"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { PAYMENT_METHODS } from "@/lib/checkout/types";
import { ShoppingBag, Loader2, Plus, Trash2 } from "lucide-react";

type ClientSummary = { id: string; phone: string; name: string | null; role: "CUSTOMER" | "ADMIN" };
type SavedAddress = {
  id: string;
  label: string | null;
  governorate: string;
  city: string | null;
  area: string | null;
  street: string;
  phone: string;
  isDefault: boolean;
};
type ClientDetails = ClientSummary & { savedAddresses: SavedAddress[] };
type EditableItem = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPricePiastres: number;
  quantity: number;
};
type ProductVariantOption = { id: string; label: string; pricePiastres: number };
type CheckoutSummary = {
  subtotal: number;
  couponDiscount: number;
  seniorFreeValue: number;
  shippingFee: number;
  codFee: number;
  finalTotal: number;
  appliedCouponCode: string | null;
};

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  PAYMOB: "بطاقة (تجريبي)",
  INSTAPAY_PREPAID: "الدفع عبر InstaPay",
};

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

export default function NewAdminOrderPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [clientSearch, setClientSearch] = React.useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = React.useState("");
  const [clientOptions, setClientOptions] = React.useState<ClientSummary[]>([]);
  const [loadingClients, setLoadingClients] = React.useState(false);
  const [selectedClientId, setSelectedClientId] = React.useState("");
  const [selectedClient, setSelectedClient] = React.useState<ClientDetails | null>(null);
  const [loadingSelectedClient, setLoadingSelectedClient] = React.useState(false);
  const [selectedAddressId, setSelectedAddressId] = React.useState("");
  const [editableItems, setEditableItems] = React.useState<EditableItem[]>([]);
  const [variantSearch, setVariantSearch] = React.useState("");
  const [variantOptions, setVariantOptions] = React.useState<ProductVariantOption[]>([]);
  const [selectedVariantId, setSelectedVariantId] = React.useState("");
  const [newItemQty, setNewItemQty] = React.useState(1);
  const [paymentMethod, setPaymentMethod] = React.useState<string>("COD");
  const [couponCode, setCouponCode] = React.useState("");
  const [adminNotes, setAdminNotes] = React.useState("طلب من لوحة الإدارة");
  const [summary, setSummary] = React.useState<CheckoutSummary | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [clientSearch]);

  React.useEffect(() => {
    const ac = new AbortController();
    const params = new URLSearchParams({ limit: "20", offset: "0" });
    if (debouncedClientSearch) params.set("q", debouncedClientSearch);
    setLoadingClients(true);
    fetch(`/api/admin/clients?${params}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: { clients?: ClientSummary[] } }) => {
        if (!ac.signal.aborted && json?.success) setClientOptions(json.data?.clients ?? []);
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
    setLoadingSelectedClient(true);
    const ac = new AbortController();
    fetch(`/api/admin/clients/${selectedClientId}`, { credentials: "include", signal: ac.signal })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: ClientDetails }) => {
        if (!ac.signal.aborted && json?.success && json.data) {
          setSelectedClient(json.data);
          const addresses = json.data.savedAddresses;
          if (addresses.length) {
            const preferred = addresses.find((a) => a.isDefault) ?? addresses[0];
            setSelectedAddressId(preferred.id);
          } else {
            setSelectedAddressId("");
          }
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingSelectedClient(false);
      });
    return () => ac.abort();
  }, [selectedClientId]);

  React.useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ limit: "20", offset: "0", active: "true" });
        if (variantSearch.trim()) params.set("q", variantSearch.trim());
        const res = await fetch(`/api/admin/products?${params}`, {
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

  const buildPayload = () => ({
    userId: selectedClientId,
    savedAddressId: selectedAddressId,
    items: editableItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    paymentMethod,
    couponCode: couponCode.trim() || null,
    adminNotes: adminNotes.trim() || null,
  });

  const canPreview =
    selectedClientId &&
    selectedAddressId &&
    editableItems.length > 0 &&
    PAYMENT_METHODS.includes(paymentMethod as (typeof PAYMENT_METHODS)[number]);

  React.useEffect(() => {
    if (!canPreview) {
      setSummary(null);
      return;
    }
    const ac = new AbortController();
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/admin/orders/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: ac.signal,
          body: JSON.stringify(buildPayload()),
        });
        const json = await res.json();
        if (!ac.signal.aborted) {
          if (res.ok && json?.success) setSummary(json.data.summary);
          else setSummary(null);
        }
      } catch {
        if (!ac.signal.aborted) setSummary(null);
      } finally {
        if (!ac.signal.aborted) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      ac.abort();
      clearTimeout(t);
    };
  }, [selectedClientId, selectedAddressId, editableItems, paymentMethod, couponCode, canPreview]);

  const addSelectedVariant = () => {
    if (!selectedVariantId) return;
    const option = variantOptions.find((o) => o.id === selectedVariantId);
    if (!option) return;
    const parts = option.label.split(" - ");
    const productName = parts[0] ?? option.label;
    const variantName = parts.slice(1).join(" - ") || option.label;
    setEditableItems((prev) => {
      const existing = prev.find((i) => i.variantId === option.id);
      if (existing) {
        return prev.map((i) =>
          i.variantId === option.id
            ? { ...i, quantity: i.quantity + Math.max(1, Math.trunc(newItemQty || 1)) }
            : i
        );
      }
      return [
        ...prev,
        {
          variantId: option.id,
          productName,
          variantName,
          unitPricePiastres: option.pricePiastres,
          quantity: Math.max(1, Math.trunc(newItemQty || 1)),
        },
      ];
    });
    setSelectedVariantId("");
    setNewItemQty(1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPreview) {
      toast({ title: "اختر العميل والعنوان وأضف أصنافاً", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(buildPayload()),
      });
      const json = await res.json();
      if (res.ok && json?.success && json.data?.orderId) {
        toast({ title: json.message ?? "تم إنشاء الطلب" });
        router.push(`/admin/orders/${json.data.orderId}`);
      } else {
        toast({ title: json?.error?.message ?? "فشل إنشاء الطلب", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="طلب جديد"
        description="إنشاء طلب لعميل موجود دون المساس بسلته."
        actions={
          <Button variant="outline" className="rounded-xl" asChild>
            <Link href="/admin/orders">← القائمة</Link>
          </Button>
        }
      />

      <form onSubmit={submit} className="space-y-6">
        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle>العميل</CardTitle>
            <CardDescription>ابحث بالهاتف أو الاسم واختر عميلاً (ليس مسؤولاً).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="clientSearch">بحث</Label>
              <Input
                id="clientSearch"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="هاتف أو اسم…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientSelect">العميل</Label>
              <Select
                id="clientSelect"
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                disabled={loadingClients}
              >
                <option value="">اختر عميلاً</option>
                {clientOptions
                  .filter((c) => c.role === "CUSTOMER")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name?.trim() || c.phone} — {c.phone}
                    </option>
                  ))}
              </Select>
            </div>
            {loadingSelectedClient && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري تحميل العناوين…
              </p>
            )}
            {selectedClient && selectedClient.savedAddresses.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="addressSelect">عنوان التوصيل</Label>
                <Select
                  id="addressSelect"
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                >
                  {selectedClient.savedAddresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.label ? `${a.label} — ` : "") +
                        `${a.governorate}${a.city ? `، ${a.city}` : ""} — ${a.street}`}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {selectedClient && selectedClient.savedAddresses.length === 0 && (
              <p className="text-sm text-amber-700">
                لا يوجد عنوان محفوظ لهذا العميل. أضف عنواناً من{" "}
                <Link href={`/admin/clients/${selectedClient.id}`} className="underline">
                  ملف العميل
                </Link>{" "}
                أولاً.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-burgundy" />
              الأصناف
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[12rem] flex-1"
                value={variantSearch}
                onChange={(e) => setVariantSearch(e.target.value)}
                placeholder="بحث منتج / متغير…"
              />
              <Select
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                className="min-w-[14rem]"
              >
                <option value="">اختر متغيراً</option>
                {variantOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} — {egp(o.pricePiastres)}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min={1}
                className="w-20"
                value={newItemQty}
                onChange={(e) => setNewItemQty(parseInt(e.target.value, 10) || 1)}
              />
              <Button type="button" variant="outline" onClick={addSelectedVariant}>
                <Plus className="h-4 w-4" />
                إضافة
              </Button>
            </div>
            {editableItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم تُضف أصناف بعد.</p>
            ) : (
              <ul className="divide-y rounded-xl border border-border/60">
                {editableItems.map((item) => (
                  <li key={item.variantId} className="flex items-center justify-between gap-4 p-3 text-sm">
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-muted-foreground">{item.variantName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-16"
                        value={item.quantity}
                        onChange={(e) => {
                          const q = Math.max(1, parseInt(e.target.value, 10) || 1);
                          setEditableItems((prev) =>
                            prev.map((i) => (i.variantId === item.variantId ? { ...i, quantity: q } : i))
                          );
                        }}
                      />
                      <span className="text-muted-foreground whitespace-nowrap">
                        {egp(item.unitPricePiastres * item.quantity)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEditableItems((prev) => prev.filter((i) => i.variantId !== item.variantId))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-card">
          <CardHeader>
            <CardTitle>الدفع والملاحظات</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="payment">طريقة الدفع</Label>
              <Select id="payment" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABELS[m] ?? m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coupon">كوبون (اختياري)</Label>
              <Input
                id="coupon"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                dir="ltr"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="adminNotes">ملاحظات إدارية</Label>
              <Input id="adminNotes" value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {canPreview && (
          <Card className="rounded-2xl border-burgundy/20 bg-burgundy/5 shadow-card">
            <CardHeader>
              <CardTitle>ملخص الطلب</CardTitle>
              {previewLoading && (
                <CardDescription className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جاري الحساب…
                </CardDescription>
              )}
            </CardHeader>
            {summary && !previewLoading && (
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <p>المجموع الفرعي: {egp(summary.subtotal)}</p>
                {summary.couponDiscount > 0 && <p>خصم الكوبون: −{egp(summary.couponDiscount)}</p>}
                {summary.seniorFreeValue > 0 && <p>عرض كبار السن: −{egp(summary.seniorFreeValue)}</p>}
                <p>الشحن: {egp(summary.shippingFee)}</p>
                {summary.codFee > 0 && <p>رسوم الاستلام: {egp(summary.codFee)}</p>}
                <p className="font-bold sm:col-span-2">الإجمالي: {egp(summary.finalTotal)}</p>
                {summary.appliedCouponCode && (
                  <p className="text-muted-foreground sm:col-span-2">كوبون: {summary.appliedCouponCode}</p>
                )}
              </CardContent>
            )}
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" asChild>
            <Link href="/admin/orders">إلغاء</Link>
          </Button>
          <Button type="submit" className="rounded-xl" disabled={submitting || !canPreview || previewLoading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            إنشاء الطلب
          </Button>
        </div>
      </form>
    </div>
  );
}
