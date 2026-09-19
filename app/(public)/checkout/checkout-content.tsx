"use client";

import * as React from "react";
import { useEffect, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/cart-context";
import { CHECKOUT_PAYMENT_OPTIONS } from "@/lib/checkout/types";
import {
  getInstapayTransferHref,
  getInstapayStoreHref,
  copyInstapayAddress,
  getInstapayDetailsForPartner,
} from "@/lib/checkout/instapay";
import { parseJsonResponse } from "@/lib/api/parse-json";
import {
  isCheckoutAddressComplete,
  isSavedAddressIncomplete,
} from "@/lib/addresses/completeness";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ShoppingBag } from "lucide-react";
import Link from "next/link";

import { SectionHeading } from "@/components/checkout/section-heading";
import { SavedAddressList } from "@/components/checkout/saved-address-list";
import { AddressForm } from "@/components/checkout/address-form";
import { PaymentMethodSection } from "@/components/checkout/payment-method-section";
import { OrderReview } from "@/components/checkout/order-review";
import { SummaryAside } from "@/components/checkout/summary-aside";
import { InstapayModal } from "@/components/checkout/instapay-modal";
import { SuccessModal } from "@/components/checkout/success-modal";
import { GuestPanel } from "@/components/checkout/guest-panel";
import { CheckoutSkeleton } from "@/components/checkout/checkout-skeleton";
import { Skeleton } from "@/components/shared/skeleton";
import {
  emptyAddress,
  addressToPayload,
  savedToAddress,
  type AddressFormValues,
  type CheckoutSummaryResponse,
  type SavedAddress,
} from "@/components/checkout/types";
import { trackEvent, ga4Item } from "@/lib/analytics/ga4-client";
import type { CartItem } from "@/contexts/cart-context";

function ga4ItemsFromCart(items: CartItem[]) {
  return items.map((item) =>
    ga4Item({
      sku: item.sku,
      name: item.productName,
      variant: [item.colorName, item.size].filter((p): p is string => !!p && p.trim().length > 0).join(" / ") || undefined,
      priceEgp: item.priceEgp,
      quantity: item.quantity,
    })
  );
}

/**
 * GA4 `purchase` — fired right when `place-order` succeeds (this is the storefront's order
 * confirmation moment: a toast + redirect for COD, the success modal for InstaPay; there is no
 * separate confirmation route). Guarded per order id in `sessionStorage` so a reload/re-render
 * of this same success handler (or, defensively, a double-invocation) never double-counts a sale.
 */
function firePurchaseOnce(orderId: string, summary: CheckoutSummaryResponse, items: CartItem[]) {
  const key = `ga4_purchase_${orderId}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* sessionStorage unavailable — fire once best-effort anyway */
  }
  const valueEgp = Math.round((summary.subtotal - summary.couponDiscount - summary.seniorFreeValue) / 100);
  trackEvent("purchase", {
    transaction_id: orderId,
    currency: "EGP",
    value: valueEgp,
    shipping: Math.round(summary.shippingFee / 100),
    items: ga4ItemsFromCart(items),
  });
}

export function CheckoutContent() {
  const router = useRouter();
  const { cart, refreshCart } = useCart();
  const { toast } = useToast();

  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [profilePhone, setProfilePhone] = useState<string>("");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [address, setAddress] = useState<AddressFormValues>(emptyAddress);
  /** City entered at checkout when a saved address predates the required city field. */
  const [pendingCity, setPendingCity] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<string>(CHECKOUT_PAYMENT_OPTIONS[0].value);
  const [couponCode, setCouponCode] = useState("");
  /** Coupon code sent to API; only updated when user clicks Apply (طبق), so typing does not trigger recalc. */
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [summary, setSummary] = useState<CheckoutSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [instaPayModalOpen, setInstaPayModalOpen] = useState(false);
  const [instaPayConfirmLoading, setInstaPayConfirmLoading] = useState(false);
  const [instapayTransferHref, setInstapayTransferHref] = useState("#");
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const instapayDetails = getInstapayDetailsForPartner(summary?.partnerName);

  // GA4 begin_checkout — fires once, when the checkout page first has a non-empty cart to show
  // (backlog 6.7). Guarded by a ref so re-renders (address edits, coupon changes) don't refire.
  const beginCheckoutFired = React.useRef(false);
  useEffect(() => {
    if (beginCheckoutFired.current) return;
    if (!cart || cart.items.length === 0) return;
    beginCheckoutFired.current = true;
    trackEvent("begin_checkout", {
      currency: "EGP",
      value: cart.subtotalEgp,
      items: ga4ItemsFromCart(cart.items),
    });
  }, [cart]);

  useEffect(() => {
    if (!instaPayModalOpen) return;
    const amountEgp = summary ? Math.round(summary.finalTotal / 100) : undefined;
    setInstapayTransferHref(getInstapayTransferHref(amountEgp, instapayDetails.ipa));
  }, [instaPayModalOpen, summary, instapayDetails.ipa]);

  const handleInstapayAddressClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    try {
      await copyInstapayAddress(instapayDetails.ipa);
      toast({
        title: "تم نسخ عنوان الدفع",
        description: "افتح InstaPay وألصق العنوان إن لم يظهر تلقائياً.",
      });
    } catch {
      /* clipboard blocked */
    }
    if (instapayTransferHref === "#") {
      e.preventDefault();
      window.open(getInstapayStoreHref(), "_blank", "noopener,noreferrer");
    }
  };

  const selectedSavedAddress = !useNewAddress && selectedAddressId
    ? savedAddresses.find((a) => a.id === selectedAddressId) ?? null
    : null;

  const needsCityCompletion = !!selectedSavedAddress && isSavedAddressIncomplete(selectedSavedAddress);

  const resolveCheckoutAddress = useCallback((): AddressFormValues | null => {
    if (useNewAddress) return address;
    if (!selectedSavedAddress) return null;
    const base = savedToAddress(selectedSavedAddress);
    const city = (pendingCity.trim() || selectedSavedAddress.city?.trim() || "").trim();
    return { ...base, city };
  }, [useNewAddress, address, selectedSavedAddress, pendingCity]);

  const currentAddress = resolveCheckoutAddress();

  async function persistSavedAddressCity(addressId: string, city: string): Promise<boolean> {
    const res = await fetch(`/api/profile/addresses/${addressId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ city: city.trim() }),
    });
    const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
    if (!json?.success) {
      toast({
        title: json?.error?.message ?? "تعذر حفظ المدينة على العنوان",
        variant: "destructive",
      });
      return false;
    }
    setSavedAddresses((prev) =>
      prev.map((a) => (a.id === addressId ? { ...a, city: city.trim() } : a))
    );
    setPendingCity("");
    return true;
  }

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
          setPendingCity(defaultAddr.city?.trim() ?? "");
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

  // Fetch summary when delivery address or options change.
  useEffect(() => {
    if (!authChecked || isGuest) return;

    const addr = resolveCheckoutAddress();

    if (!addr || !isCheckoutAddressComplete(addr)) {
      setSummary(null);
      return;
    }

    setSummaryLoading(true);
    let cancelled = false;
    const timer = setTimeout(() => {
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
          const json = await parseJsonResponse<{ success?: boolean; data?: CheckoutSummaryResponse; error?: { message?: string } }>(res);
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
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    authChecked,
    isGuest,
    resolveCheckoutAddress,
    paymentMethod,
    appliedCouponCode,
    router,
    toast,
  ]);

  const doPlaceOrder = async (addr: AddressFormValues) => {
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

  async function saveNewAddressIfNeeded(addr: AddressFormValues) {
    if (!useNewAddress) return;
    const saveBody = {
      label: addr.label?.trim() || null,
      governorate: addr.governorate.trim(),
      city: addr.city.trim(),
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

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const addr = currentAddress;
    if (!addr || !isCheckoutAddressComplete(addr)) {
      toast({
        title: needsCityCompletion && !pendingCity.trim()
          ? "أدخل المدينة لإكمال العنوان المحفوظ"
          : "اختر عنوان توصيل أو أكمل البيانات (المدينة والمنطقة والعنوان بالتفصيل والهاتف)",
        variant: "destructive",
      });
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
      if (selectedSavedAddress && isSavedAddressIncomplete(selectedSavedAddress)) {
        const ok = await persistSavedAddressCity(selectedSavedAddress.id, addr.city);
        if (!ok) return;
      }
      await saveNewAddressIfNeeded(addr);
      const { res, json } = await doPlaceOrder(addr);
      if (res.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (res.ok && json?.success && json.data?.orderId) {
        if (summary) firePurchaseOnce(json.data.orderId, summary, cart?.items ?? []);
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
    if (!isCheckoutAddressComplete(addr)) {
      toast({
        title: needsCityCompletion && !pendingCity.trim()
          ? "أدخل المدينة لإكمال العنوان المحفوظ"
          : "أكمل بيانات عنوان التوصيل",
        variant: "destructive",
      });
      return;
    }
    setInstaPayConfirmLoading(true);
    try {
      if (selectedSavedAddress && isSavedAddressIncomplete(selectedSavedAddress)) {
        const ok = await persistSavedAddressCity(selectedSavedAddress.id, addr.city);
        if (!ok) return;
      }
      await saveNewAddressIfNeeded(addr);
      const { res, json } = await doPlaceOrder(addr);
      if (res.status === 401) {
        router.replace("/login?redirect=/checkout");
        return;
      }
      if (res.ok && json?.success && json.data?.orderId) {
        firePurchaseOnce(json.data.orderId, summary, cart?.items ?? []);
        setInstaPayModalOpen(false);
        setSuccessModalOpen(true);
        // Do NOT refreshCart() here — it would clear cart and trigger empty-cart view before user clicks تم. Refresh after redirect in تم handler.
      } else {
        toast({ title: json?.error?.message ?? "فشل إنشاء الطلب", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال أو في قراءة الرد", variant: "destructive" });
    } finally {
      setInstaPayConfirmLoading(false);
    }
  };

  const selectSavedAddress = (a: SavedAddress) => {
    setSelectedAddressId(a.id);
    setUseNewAddress(false);
    setPendingCity(a.city?.trim() ?? "");
  };

  const switchToNewAddress = () => {
    setUseNewAddress(true);
    setSelectedAddressId(null);
    setPendingCity("");
    setAddress((a) => ({ ...a, phone: profilePhone || a.phone }));
  };

  const isEmpty = !cart || cart.items.length === 0;
  // When success modal is open (InstaPay order just placed), do NOT show empty-cart view — show main content so the modal is visible until user clicks تم
  const showEmptyCartView = isEmpty && !successModalOpen;

  return (
    <div className="container px-4 py-7 md:px-12 md:py-8">
      <h1 className="font-amiri text-[36px] font-bold text-[hsl(228_40%_14%)] md:text-5xl">إتمام الطلب</h1>
      <p className="mt-2 text-sm text-[hsl(228_18%_45%)]">تحقق من عنوان التوصيل وطريقة الدفع ثم أكد الطلب.</p>

      {!authChecked && (
        <div role="status" className="mt-8">
          <span className="sr-only">جاري التحقق…</span>
          <CheckoutSkeleton />
        </div>
      )}

      {authChecked && isGuest && <GuestPanel />}

      {authChecked && !isGuest && showEmptyCartView && (
        <EmptyState
          className="mt-8"
          icon={<ShoppingBag className="h-8 w-8" strokeWidth={1.3} />}
          title="السلة فارغة. أضف منتجات ثم عد للدفع."
          action={
            <Button asChild className="rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]">
              <Link href="/cart">عرض السلة</Link>
            </Button>
          }
        />
      )}

      {authChecked && !isGuest && !showEmptyCartView && cart && (
        <form onSubmit={handlePlaceOrder} className="mt-8 grid gap-10 lg:grid-cols-[7fr_4fr] lg:gap-16">
          <div className="space-y-10">
            {/* 01 — Delivery address */}
            <section>
              <SectionHeading number="01" title="عنوان التوصيل" />

              {addressesLoading ? (
                <div role="status" className="mt-5 space-y-3">
                  <span className="sr-only">جاري تحميل العناوين المحفوظة…</span>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <>
                  {/* Parity: the saved-address list and the "إضافة عنوان جديد" toggle stay
                      visible together with the new-address form once opened (the original
                      page never hid the list — a shopper can still tap back to a saved card
                      while the new-address fields are open). */}
                  {savedAddresses.length > 0 && (
                    <SavedAddressList
                      addresses={savedAddresses}
                      selectedAddressId={selectedAddressId}
                      useNewAddress={useNewAddress}
                      onSelect={selectSavedAddress}
                      onAddNew={switchToNewAddress}
                      needsCityCompletion={needsCityCompletion}
                      pendingCity={pendingCity}
                      onPendingCityChange={setPendingCity}
                    />
                  )}

                  {savedAddresses.length === 0 && !useNewAddress && (
                    <div className="mt-5">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 w-full rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
                        onClick={switchToNewAddress}
                      >
                        إضافة عنوان التوصيل
                      </Button>
                      <p className="mt-2 text-center text-xs text-[hsl(228_18%_45%)]">
                        أو{" "}
                        <Link href="/profile/addresses" className="border-b border-gold-500 text-[hsl(228_40%_14%)]">
                          إدارة العناوين
                        </Link>{" "}
                        من حسابك
                      </p>
                    </div>
                  )}

                  {useNewAddress && <AddressForm address={address} onChange={setAddress} />}
                </>
              )}
            </section>

            {/* 02 — Payment method */}
            <section className="border-t border-[hsl(228_16%_84%)] pt-8">
              <SectionHeading number="02" title="طريقة الدفع" />
              <PaymentMethodSection value={paymentMethod} onChange={setPaymentMethod} />
            </section>

            {/* 03 — Order review */}
            <section className="border-t border-[hsl(228_16%_84%)] pt-8">
              <SectionHeading number="03" title="مراجعة الطلب" />
              <OrderReview items={cart.items} />
            </section>
          </div>

          <SummaryAside
            cart={cart}
            summary={summary}
            summaryLoading={summaryLoading}
            paymentMethod={paymentMethod}
            couponCode={couponCode}
            onCouponCodeChange={setCouponCode}
            onApplyCoupon={() => setAppliedCouponCode(couponCode.trim())}
            onClearCoupon={() => {
              setCouponCode("");
              setAppliedCouponCode("");
            }}
            placeLoading={placeLoading}
          />
        </form>
      )}

      <InstapayModal
        open={instaPayModalOpen}
        onOpenChange={setInstaPayModalOpen}
        summary={summary}
        instapayDetails={instapayDetails}
        instapayTransferHref={instapayTransferHref}
        onAddressClick={handleInstapayAddressClick}
        onCancel={() => setInstaPayModalOpen(false)}
        onConfirm={handleInstaPayConfirm}
        confirmLoading={instaPayConfirmLoading}
      />

      <SuccessModal
        open={successModalOpen}
        onOpenChange={(open) => setSuccessModalOpen(!!open)}
        onDone={() => {
          setSuccessModalOpen(false);
          refreshCart(); // update cart (now empty) before leaving
          router.push("/profile/orders");
          router.refresh();
        }}
      />
    </div>
  );
}
