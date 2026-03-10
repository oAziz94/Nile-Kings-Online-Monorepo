"use client";

import * as React from "react";
import { useEffect, useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Price } from "@/components/shared/price";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/cart-context";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { CHECKOUT_PAYMENT_OPTIONS } from "@/lib/checkout/types";
import { MapPin, CreditCard, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseJsonResponse } from "@/lib/api/parse-json";

type Summary = {
  subtotal: number;
  couponDiscount: number;
  seniorFreeValue: number;
  shippingFee: number;
  codFee: number;
  finalTotal: number;
  appliedCouponCode: string | null;
  shippingProvider: string;
  paymentMethod?: string;
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

const CART_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop";

const emptyAddress = {
  label: "",
  governorate: "",
  city: "",
  area: "",
  street: "",
  floor: "",
  apartment: "",
  notes: "",
  phone: "",
};

/** Default minimum delivery fee (EGP) shown until address is filled and real shipping is calculated. */
const DEFAULT_MIN_SHIPPING_EGP = 50;

function piastresToEgp(p: number) {
  return Math.round(p / 100);
}
/** EGP for display when amount may be small (e.g. COD fee); avoids showing 0 for 1 piastre. */
function piastresToEgpDisplay(p: number) {
  if (p <= 0) return 0;
  const egp = p / 100;
  return egp < 1 && egp > 0 ? Number(egp.toFixed(2)) : Math.round(egp);
}

function addressToPayload(addr: typeof emptyAddress) {
  return {
    governorate: addr.governorate,
    city: addr.city || null,
    area: addr.area || null,
    street: addr.street,
    floor: addr.floor || null,
    apartment: addr.apartment || null,
    notes: addr.notes || null,
    phone: addr.phone,
  };
}

function savedToAddress(s: SavedAddress): typeof emptyAddress {
  return {
    label: s.label ?? "",
    governorate: s.governorate,
    city: s.city ?? "",
    area: s.area ?? "",
    street: s.street,
    floor: s.floor ?? "",
    apartment: s.apartment ?? "",
    notes: s.notes ?? "",
    phone: s.phone,
  };
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, refreshCart } = useCart();
  const { toast } = useToast();

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [profilePhone, setProfilePhone] = useState<string>("");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [address, setAddress] = useState(emptyAddress);

  const [paymentMethod, setPaymentMethod] = useState<string>(CHECKOUT_PAYMENT_OPTIONS[0].value);
  const [couponCode, setCouponCode] = useState("");
  /** Coupon code sent to API; only updated when user clicks Apply (طبق), so typing does not trigger recalc. */
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [instaPayModalOpen, setInstaPayModalOpen] = useState(false);
  const [instaPayConfirmLoading, setInstaPayConfirmLoading] = useState(false);
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  // Resolve effective delivery address from saved selection or new-address form
  const currentAddress = useNewAddress
    ? address
    : savedAddresses.find((a) => a.id === selectedAddressId)
      ? savedToAddress(savedAddresses.find((a) => a.id === selectedAddressId)!)
      : null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) setIsGuest(true);
        else if (res.ok) {
          const data = await parseJsonResponse<{ success?: boolean; data?: { phone?: string } }>(res);
          if (data?.data?.phone) setProfilePhone(data.data.phone);
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!authChecked || isGuest) {
      setAddressesLoading(false);
      return;
    }
    setAddressesLoading(true);
    fetch("/api/profile/addresses", { credentials: "include" })
      .then((res) => parseJsonResponse<{ success?: boolean; data?: SavedAddress[] }>(res))
      .then((json) => {
        if (json?.success && json.data?.length) {
          setSavedAddresses(json.data);
          const defaultAddr = json.data.find((a) => a.isDefault) ?? json.data[0];
          setSelectedAddressId(defaultAddr.id);
          setUseNewAddress(false);
        } else {
          setUseNewAddress(true);
        }
      })
      .catch(() => setUseNewAddress(true))
      .finally(() => setAddressesLoading(false));
  }, [authChecked, isGuest]);

  // Prefill delivery phone from profile when showing new-address form and phone is empty
  useEffect(() => {
    if (profilePhone && useNewAddress && !address.phone.trim()) {
      setAddress((a) => ({ ...a, phone: profilePhone }));
    }
  }, [profilePhone, useNewAddress, address.phone]);

  // Fetch summary when delivery address or options change. Resolve address inside effect from current state so we never use stale data.
  useEffect(() => {
    if (!authChecked || isGuest) return;

    const addr = useNewAddress
      ? address
      : selectedAddressId
        ? (() => {
          const saved = savedAddresses.find((a) => a.id === selectedAddressId);
          return saved ? savedToAddress(saved) : null;
        })()
        : null;

    if (!addr || !addr.governorate.trim() || !addr.area.trim() || !addr.street.trim() || !addr.phone.trim()) {
      setSummary(null);
      return;
    }

    setSummaryLoading(true);
    let cancelled = false;
    fetch("/api/checkout/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: addressToPayload(addr),
        couponCode: appliedCouponCode.trim() || null,
        paymentMethod,
      }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/checkout");
          return { json: null, res };
        }
        const json = await parseJsonResponse<{ success?: boolean; data?: Summary; error?: { message?: string } }>(res);
        return { json, res };
      })
      .then(({ json, res }) => {
        if (cancelled) return;
        if (json?.success && json.data) setSummary(json.data);
        else {
          setSummary(null);
          if (res && !res.ok && res.status !== 401) toast({ title: json?.error?.message ?? "تعذر حساب الملخص", variant: "destructive" });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSummary(null);
          toast({ title: "خطأ في الاتصال", variant: "destructive" });
        }
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => { cancelled = true; };
  }, [
    authChecked,
    isGuest,
    selectedAddressId,
    useNewAddress,
    paymentMethod,
    appliedCouponCode,
    address.governorate,
    address.street,
    address.phone,
    address.city,
    address.area,
    // Refetch when saved list gets the selected id (e.g. after load)
    savedAddresses.length,
    savedAddresses.find((a) => a.id === selectedAddressId)?.governorate,
    savedAddresses.find((a) => a.id === selectedAddressId)?.street,
    savedAddresses.find((a) => a.id === selectedAddressId)?.phone,
    router,
    toast,
  ]);

  const doPlaceOrder = async (addr: typeof emptyAddress) => {
    const res = await fetch("/api/checkout/place-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: addressToPayload(addr),
        paymentMethod,
        couponCode: appliedCouponCode.trim() || null,
      }),
    });
    const json = await parseJsonResponse<{ success?: boolean; data?: { orderId?: string }; error?: { message?: string } }>(res);
    return { res, json };
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = currentAddress;
    if (!addr || !addr.governorate.trim() || !addr.area.trim() || !addr.street.trim() || !addr.phone.trim()) {
      toast({ title: "اختر عنوان توصيل أو أكمل البيانات (المنطقة والعنوان بالتفصيل والهاتف)", variant: "destructive" });
      return;
    }
    if (!summary) {
      toast({ title: "انتظر تحميل الملخص أو تحقق من العنوان", variant: "destructive" });
      return;
    }
    if (paymentMethod === "INSTAPAY_PREPAID") {
      setInstaPayModalOpen(true);
      return;
    }
    setPlaceLoading(true);
    try {
      if (useNewAddress) {
        const saveBody = {
          label: addr.label?.trim() || null,
          governorate: addr.governorate.trim(),
          city: addr.city?.trim() || null,
          area: addr.area?.trim() || null,
          street: addr.street.trim(),
          floor: addr.floor?.trim() || null,
          apartment: addr.apartment?.trim() || null,
          notes: addr.notes?.trim() || null,
          phone: addr.phone.trim(),
        };
        await fetch("/api/profile/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(saveBody),
        });
      }
      const { res, json } = await doPlaceOrder(addr);
      if (res.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (res.ok && json?.success && json.data?.orderId) {
        toast({ title: "تم إنشاء الطلب بنجاح", variant: "success" });
        await refreshCart();
        router.push("/profile/orders");
        router.refresh();
      } else {
        toast({ title: json?.error?.message ?? "فشل إنشاء الطلب", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال أو في قراءة الرد", variant: "destructive" });
    } finally {
      setPlaceLoading(false);
    }
  };

  const handleInstaPayConfirm = async () => {
    const addr = currentAddress;
    if (!addr || !summary) return;
    setInstaPayConfirmLoading(true);
    try {
      if (useNewAddress) {
        const saveBody = {
          label: addr.label?.trim() || null,
          governorate: addr.governorate.trim(),
          city: addr.city?.trim() || null,
          area: addr.area?.trim() || null,
          street: addr.street.trim(),
          floor: addr.floor?.trim() || null,
          apartment: addr.apartment?.trim() || null,
          notes: addr.notes?.trim() || null,
          phone: addr.phone.trim(),
        };
        await fetch("/api/profile/addresses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(saveBody),
        });
      }
      const { res, json } = await doPlaceOrder(addr);
      if (res.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (res.ok && json?.success && json.data?.orderId) {
        setInstaPayModalOpen(false);
        setSuccessModalOpen(true);
        await refreshCart();
      } else {
        toast({ title: json?.error?.message ?? "فشل إنشاء الطلب", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال أو في قراءة الرد", variant: "destructive" });
    } finally {
      setInstaPayConfirmLoading(false);
    }
  };

  const isEmpty = !cart || cart.items.length === 0;

  if (!authChecked) {
    return (
      <div className="container px-4 py-10">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-bold text-foreground">الدفع</h1>
          <p className="mt-4 text-muted-foreground">جاري التحقق…</p>
        </div>
      </div>
    );
  }

  if (isGuest) {
    return (
      <div className="container px-4 py-10">
        <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">الدفع</h1>
          <p className="mt-4 text-muted-foreground">سجّل الدخول أو أنشئ حساباً لإتمام الطلب.</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="rounded-2xl">
              <Link href="/login?redirect=/checkout">تسجيل الدخول</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/register?redirect=/checkout">إنشاء حساب</Link>
            </Button>
          </div>
          <Button asChild variant="ghost" className="mt-4 rounded-2xl">
            <Link href="/cart">العودة للسلة</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="container px-4 py-10">
        <div className="mx-auto max-w-md text-center">
          <h1 className="text-2xl font-bold text-foreground">الدفع</h1>
          <p className="mt-4 text-muted-foreground">السلة فارغة. أضف منتجات ثم عد للدفع.</p>
          <Button asChild className="mt-6 rounded-2xl">
            <Link href="/cart">عرض السلة</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container px-4 py-8">
      <h1 className="text-2xl font-bold text-foreground md:text-3xl">إتمام الطلب</h1>
      <p className="mt-1 text-sm text-muted-foreground">تحقق من عنوان التوصيل وطريقة الدفع ثم أكد الطلب.</p>

      <form onSubmit={handlePlaceOrder} className="mt-8 grid gap-8 lg:grid-cols-5">
        {/* Left: address + shipping + payment */}
        <div className="lg:col-span-3 space-y-6">
          {/* Delivery address */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              عنوان التوصيل
            </h2>

            {addressesLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">جاري تحميل العناوين المحفوظة…</p>
            ) : savedAddresses.length > 0 ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-medium text-foreground">اختر عنواناً محفوظاً</p>
                <div className="space-y-2">
                  {savedAddresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedAddressId(a.id);
                        setUseNewAddress(false);
                      }}
                      className={cn(
                        "w-full rounded-xl border p-4 text-right transition-colors",
                        selectedAddressId === a.id && !useNewAddress
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{a.label || a.governorate}</span>
                        {a.isDefault && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">افتراضي</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[a.governorate, a.city, a.area, a.street].filter(Boolean).join("، ")}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground" dir="ltr">{a.phone}</p>
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">أو</p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => {
                    setUseNewAddress(true);
                    setSelectedAddressId(null);
                    setAddress((a) => ({ ...a, phone: profilePhone || a.phone }));
                  }}
                >
                  <MapPin className="h-4 w-4 ml-2" />
                  إضافة عنوان جديد
                </Button>
              </div>
            ) : null}

            {useNewAddress && (
              <div className="mt-4 rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground">عنوان جديد</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">تسمية (اختياري)</label>
                    <Input
                      value={address.label}
                      onChange={(e) => setAddress((a) => ({ ...a, label: e.target.value }))}
                      placeholder="مثال: المنزل"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">المحافظة *</label>
                    <select
                      value={address.governorate}
                      onChange={(e) => setAddress((a) => ({ ...a, governorate: e.target.value }))}
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-4 py-2 text-sm"
                      required={useNewAddress}
                      dir="rtl"
                    >
                      <option value="">اختر المحافظة</option>
                      {GOVERNORATE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">هاتف التوصيل *</label>
                    <Input
                      type="tel"
                      value={address.phone}
                      onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))}
                      required={useNewAddress}
                      dir="ltr"
                      className="rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">المنطقة *</label>
                    <Input
                      value={address.area}
                      onChange={(e) => setAddress((a) => ({ ...a, area: e.target.value }))}
                      required={useNewAddress}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-foreground">العنوان بالتفصيل *</label>
                    <Input
                      value={address.street}
                      onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))}
                      required={useNewAddress}
                      className="rounded-xl"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-foreground">ملاحظات (اختياري)</label>
                    <Input
                      value={address.notes}
                      onChange={(e) => setAddress((a) => ({ ...a, notes: e.target.value }))}
                      placeholder="أي ملاحظات للتوصيل"
                      className="rounded-xl"
                    />
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  يمكنك حفظ العناوين من{" "}
                  <Link href="/profile/addresses" className="text-primary underline hover:no-underline">
                    عناويني
                  </Link>{" "}
                  لاستخدامها في الطلبات القادمة. العنوان الذي تدخله هنا سيُحفظ أيضاً في عناوينك تلقائياً.
                </p>
              </div>
            )}

            {!addressesLoading && savedAddresses.length === 0 && !useNewAddress && (
              <div className="mt-4">
                <Button type="button" variant="outline" className="w-full rounded-xl" onClick={() => setUseNewAddress(true)}>
                  <MapPin className="h-4 w-4 ml-2" />
                  إضافة عنوان التوصيل
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  أو <Link href="/profile/addresses" className="text-primary underline">إدارة العناوين</Link> من حسابك
                </p>
              </div>
            )}
          </section>

          {/* Payment - Phase 1: single carrier (Egypt Post), no carrier selection */}
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              طريقة الدفع
            </h2>
            <div className="mt-4 space-y-3">
                {CHECKOUT_PAYMENT_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="payment"
                      value={opt.value}
                      checked={paymentMethod === opt.value}
                      onChange={() => setPaymentMethod(opt.value)}
                      className="mt-1 h-4 w-4 shrink-0"
                    />
                    <div>
                      <span className="text-sm font-medium">{opt.label}</span>
                      {opt.value === "INSTAPAY_PREPAID" && (
                        <p className="mt-0.5 text-xs text-green-600">شحن أقل عند الدفع عبر InstaPay</p>
                      )}
                    </div>
                  </label>
                ))}
            </div>
          </section>
        </div>

        {/* Right: sticky order summary */}
        <div className="lg:col-span-2">
          <div className="sticky top-24 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <h2 className="text-base font-semibold text-foreground">ملخص الطلب</h2>

            {/* Cart snippet */}
            {cart && cart.items.length > 0 && (
              <ul className="mt-4 space-y-3 border-b border-border pb-4">
                {cart.items.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex gap-3 text-sm">
                    <Link
                      href={`/products/${item.variantSlug ?? item.productSlug}`}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted"
                    >
                      <Image
                        src={item.imageUrl || CART_PLACEHOLDER_IMAGE}
                        alt={item.productName}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                      {item.quantity > 1 && (
                        <span className="absolute bottom-0 start-0 flex h-5 min-w-5 items-center justify-center rounded-tl bg-foreground/80 px-1 text-xs font-medium text-background">
                          {item.quantity}
                        </span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/products/${item.variantSlug ?? item.productSlug}`}
                        className="font-medium text-foreground line-clamp-2 hover:underline"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-muted-foreground">{item.variantName}</p>
                      <Price amount={item.priceEgp * item.quantity} size="sm" className="mt-0.5" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {summaryLoading ? (
              <p className="mt-4 text-sm text-muted-foreground">جاري الحساب…</p>
            ) : summary ? (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>المجموع الفرعي {cart ? `${cart.itemCount} عناصر` : ""}</span>
                  <Price amount={piastresToEgp(summary.subtotal)} />
                </div>
                {summary.couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>خصم كود</span>
                    <span>- {piastresToEgp(summary.couponDiscount).toLocaleString("en-US")} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground">
                  <span>رسوم الشحن</span>
                  <Price amount={piastresToEgp(summary.shippingFee + (paymentMethod === "COD" ? summary.codFee : 0))} />
                </div>
                {/* Promo code field: left section, exactly before final total */}
                <div className="border-t border-border pt-3">
                  <label className="text-xs font-medium text-muted-foreground">الرقم التسلسلي للخصم</label>
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="اختياري"
                        className="rounded-xl pe-9"
                      />
                      {(couponCode.trim() || summary.appliedCouponCode) && (
                        <button
                          type="button"
                          onClick={() => {
                            setCouponCode("");
                            setAppliedCouponCode("");
                          }}
                          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="إزالة كود الخصم"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-xl shrink-0"
                      onClick={() => setAppliedCouponCode(couponCode.trim())}
                    >
                      طبق
                    </Button>
                  </div>
                  {summary.appliedCouponCode && (
                    <p className="mt-2 text-xs text-green-600">تم تطبيق: {summary.appliedCouponCode}</p>
                  )}
                  {couponCode.trim() && !summary.appliedCouponCode && (
                    <p className="mt-2 text-xs text-destructive">كود الخصم غير صالح أو منتهي الصلاحية.</p>
                  )}
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
                  <span>الإجمالي</span>
                  <Price amount={piastresToEgp(summary.finalTotal)} size="lg" />
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>المجموع الفرعي {cart ? `${cart.itemCount} عناصر` : ""}</span>
                  <Price amount={cart?.subtotalEgp ?? 0} />
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>الشحن</span>
                  <span className="text-muted-foreground/80">
                    <Price amount={DEFAULT_MIN_SHIPPING_EGP} /> (حد أدنى حتى إكمال العنوان)
                  </span>
                </div>
                {/* Promo code: same position as when summary exists, exactly before final total */}
                <div className="border-t border-border pt-3">
                  <label className="text-xs font-medium text-muted-foreground">الرقم التسلسلي للخصم</label>
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        placeholder="اختياري"
                        className="rounded-xl pe-9"
                      />
                      {couponCode.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            setCouponCode("");
                            setAppliedCouponCode("");
                          }}
                          className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="إزالة كود الخصم"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-xl shrink-0"
                      onClick={() => setAppliedCouponCode(couponCode.trim())}
                    >
                      طبق
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-base font-semibold text-foreground">
                  <span>الإجمالي</span>
                  <Price amount={(cart?.subtotalEgp ?? 0) + DEFAULT_MIN_SHIPPING_EGP} size="lg" />
                </div>
                <p className="text-xs text-muted-foreground">اختر عنوان التوصيل لعرض الشحن والخصومات الفعلية.</p>
              </div>
            )}
            <Button
              type="submit"
              className="mt-6 w-full rounded-2xl"
              size="lg"
              disabled={!summary || placeLoading}
            >
              {placeLoading ? "جاري إنشاء الطلب…" : "تأكيد الطلب"}
            </Button>
            <Button asChild variant="ghost" className="mt-2 w-full rounded-2xl" size="sm">
              <Link href="/cart">العودة للسلة</Link>
            </Button>
          </div>
        </div>
      </form>

      {/* InstaPay payment instructions modal */}
      <Dialog open={instaPayModalOpen} onOpenChange={setInstaPayModalOpen}>
        <DialogContent className="max-w-sm rounded-2xl text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>الدفع عبر InstaPay</DialogTitle>
            <DialogDescription className="mt-2">
              قم بتحويل قيمة الطلب عبر InstaPay لإتمام الطلب. شحن أقل عند الدفع عبر InstaPay — تم إلغاء رسوم الاستلام.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <img
              src="/instapay-qr.jpeg"
              alt="InstaPay QR"
              className="h-48 w-48 object-contain rounded-lg border border-border bg-muted/30"
            />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">omar947@instapay</p>
              <p className="mt-1 text-xs text-muted-foreground">Powered by InstaPay</p>
              {summary && (
                <p className="mt-3 text-base font-semibold text-foreground">
                  المبلغ: {piastresToEgp(summary.finalTotal).toLocaleString("ar-EG")} ج.م
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              onClick={() => setInstaPayModalOpen(false)}
              disabled={instaPayConfirmLoading}
            >
              إلغاء
            </Button>
            <Button
              type="button"
              className="rounded-xl"
              onClick={handleInstaPayConfirm}
              disabled={instaPayConfirmLoading}
            >
              {instaPayConfirmLoading ? "جاري إنشاء الطلب…" : "أتممت التحويل"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success modal after InstaPay order */}
      <Dialog open={successModalOpen} onOpenChange={setSuccessModalOpen}>
        <DialogContent className="max-w-sm rounded-2xl text-right" dir="rtl">
          <DialogHeader>
            <DialogTitle>تم إرسال طلبك بنجاح</DialogTitle>
            <DialogDescription className="mt-2">
              سيصلك قريبًا رسالة أو اتصال على رقمك لتأكيد الطلب.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              className="rounded-xl w-full sm:w-auto"
              onClick={() => {
                setSuccessModalOpen(false);
                router.push("/profile/orders");
                router.refresh();
              }}
            >
              حسنًا
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
