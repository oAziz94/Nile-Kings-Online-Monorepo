"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetCloseButton } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, formatEgp } from "@/lib/sales/format";
import { MAX_LINE_QTY, MAX_SALE_LINES, type SalePaymentMethod } from "@/lib/sales/validation";

/**
 * Counter screen (backlog 11.3, plan 12 section 3). Plain on purpose: the owner designs the final
 * look in 11.9. Search over the outlet's own stock (inventory list API, sellable > 0 filtered
 * client-side), tap to add, cart as a right column on desktop and a bottom sheet on phones.
 */

type SearchVariant = {
  id: string;
  sku: string;
  name: string;
  colorName: string | null;
  pricePiastres: number;
  sellable: number;
};
type SearchProduct = { id: string; name: string; variants: SearchVariant[] };

type SearchRow = {
  variantId: string;
  productName: string;
  size: string;
  colour: string | null;
  sku: string;
  pricePiastres: number;
  sellable: number;
};

type CartLine = SearchRow & { quantity: number };

const SELLER_KEY = "nk-outlet-seller-name";

function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

function rowLabel(r: { productName: string; size: string; colour: string | null }) {
  return `${r.productName} — ${r.size}${r.colour ? ` – ${r.colour}` : ""}`;
}

const PAYMENT_ORDER: SalePaymentMethod[] = ["CASH", "INSTAPAY", "CARD"];

export function CounterScreen() {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [term, setTerm] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [results, setResults] = React.useState<SearchRow[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);

  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [payment, setPayment] = React.useState<SalePaymentMethod>("CASH");
  const [customerPhone, setCustomerPhone] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [sellerName, setSellerName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // A double tap can fire before the `submitting` re-render disables the button — guard with a ref too.
  const submitLock = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Seller name is remembered per device.
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SELLER_KEY);
      if (saved) setSellerName(saved);
    } catch {
      /* storage unavailable (private mode) - the field just starts empty */
    }
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    setSearching(true);
    setSearchError(null);
    fetch(`/api/partner/inventory?limit=30&q=${encodeURIComponent(debounced)}`, {
      credentials: "include",
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json?.error?.message ?? "تعذّر تحميل الأصناف");
        const rows: SearchRow[] = (json.data.products as SearchProduct[]).flatMap((p) =>
          p.variants
            .filter((v) => v.sellable > 0)
            .map((v) => ({
              variantId: v.id,
              productName: p.name,
              size: v.name,
              colour: v.colorName,
              sku: v.sku,
              pricePiastres: v.pricePiastres,
              sellable: v.sellable,
            }))
        );
        setResults(rows);
        setSearching(false);
      })
      .catch((e: unknown) => {
        if ((e as { name?: string }).name === "AbortError") return;
        setSearchError(e instanceof Error ? e.message : "تعذّر تحميل الأصناف");
        setSearching(false);
      });
    return () => ctrl.abort();
  }, [debounced]);

  const total = cart.reduce((s, l) => s + l.quantity * l.pricePiastres, 0);
  const count = cart.reduce((s, l) => s + l.quantity, 0);

  function add(row: SearchRow) {
    setError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === row.variantId);
      if (existing) {
        return prev.map((l) =>
          l.variantId === row.variantId
            ? { ...l, sellable: row.sellable, quantity: Math.min(l.quantity + 1, row.sellable, MAX_LINE_QTY) }
            : l
        );
      }
      if (prev.length >= MAX_SALE_LINES) return prev;
      return [...prev, { ...row, quantity: 1 }];
    });
  }

  function setQty(variantId: string, quantity: number) {
    setCart((prev) =>
      prev.map((l) =>
        l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(quantity, l.sellable, MAX_LINE_QTY)) } : l
      )
    );
  }

  function remove(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  }

  async function submit() {
    if (cart.length === 0 || submitting || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/sales", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          paymentMethod: payment,
          customerPhone: customerPhone.trim() || undefined,
          customerName: customerName.trim() || undefined,
          sellerName: sellerName.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        try {
          if (sellerName.trim()) window.localStorage.setItem(SELLER_KEY, sellerName.trim());
        } catch {
          /* ignore */
        }
        router.push(`/partner/sales/${json.data.sale.id}`);
        return;
      }
      if (res.status === 409 && Array.isArray(json?.error?.details?.shortLines)) {
        const short = json.error.details.shortLines as { variantId: string; available: number }[];
        const availableBy = new Map(short.map((s) => [s.variantId, s.available]));
        setCart((prev) =>
          prev
            .filter((l) => (availableBy.get(l.variantId) ?? 1) > 0)
            .map((l) => {
              const avail = availableBy.get(l.variantId);
              return avail === undefined ? l : { ...l, sellable: avail, quantity: Math.min(l.quantity, avail) };
            })
        );
      }
      setError(json?.error?.message ?? "تعذّر تسجيل البيع");
      setSubmitting(false);
      submitLock.current = false;
    } catch {
      setError("تعذّر الاتصال بالخادم، حاول مرة أخرى");
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  const cartPanel = (
    <CartPanel
      cart={cart}
      total={total}
      payment={payment}
      setPayment={setPayment}
      customerPhone={customerPhone}
      setCustomerPhone={setCustomerPhone}
      customerName={customerName}
      setCustomerName={setCustomerName}
      sellerName={sellerName}
      setSellerName={setSellerName}
      notes={notes}
      setNotes={setNotes}
      setQty={setQty}
      remove={remove}
      error={error}
      submitting={submitting}
      onSubmit={submit}
    />
  );

  return (
    <div className="grid gap-5 pb-24 lg:grid-cols-[minmax(0,1fr)_400px] lg:pb-0">
      <section aria-label="البحث عن الأصناف" className="min-w-0 pb-24 lg:pb-0">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
          <Input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ابحث بالاسم أو الكود أو اللون"
            aria-label="بحث عن صنف"
            className="ps-10"
            autoComplete="off"
            data-testid="counter-search"
          />
        </div>

        <ul className="mt-3 divide-y divide-[hsl(228_16%_90%)] rounded-2xl bg-white shadow-subtle" data-testid="counter-results">
          {searchError && <li className="p-4 text-sm text-destructive">{searchError}</li>}
          {!searchError && !searching && results.length === 0 && (
            <li className="p-4 text-sm text-ink-soft">لا توجد أصناف متاحة مطابقة</li>
          )}
          {results.map((r) => {
            const inCart = cart.find((l) => l.variantId === r.variantId)?.quantity ?? 0;
            return (
              <li key={r.variantId}>
                <button
                  type="button"
                  onClick={() => add(r)}
                  disabled={inCart >= r.sellable}
                  className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  data-testid="counter-result"
                  data-sku={r.sku}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-ink">
                      {r.productName} — {r.size}
                      {r.colour ? ` – ${r.colour}` : ""}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-soft">
                      <bdi dir="ltr" className="font-archivo">{r.sku}</bdi> · متاح{" "}
                      <bdi dir="ltr" className="font-archivo">{r.sellable}</bdi>
                    </span>
                  </span>
                  <span dir="ltr" className="shrink-0 font-archivo text-sm font-bold text-ink">
                    {formatEgp(r.pricePiastres)}
                  </span>
                  <Plus className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span className="sr-only">إضافة للسلة</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {isDesktop ? (
        <aside aria-label="السلة" className="self-start rounded-2xl bg-white p-4 shadow-subtle lg:sticky lg:top-4">
          {cartPanel}
        </aside>
      ) : (
        <>
          {/* Sits above the dashboard shell's phone tab bar (fixed, z-40, ~4.5rem incl. safe area). */}
          <div className="fixed inset-x-0 bottom-[4.75rem] z-30 border-t border-[hsl(228_16%_86%)] bg-white p-3">
            <Button type="button" className="h-12 w-full justify-between" onClick={() => setSheetOpen(true)} data-testid="cart-open">
              <span className="flex items-center gap-2">
                <ShoppingBag aria-hidden />
                السلة (<bdi dir="ltr" className="font-archivo">{count}</bdi>)
              </span>
              <span dir="ltr" className="font-archivo">{formatEgp(total)}</span>
            </Button>
          </div>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="max-h-[92dvh]">
              <SheetHeader>
                <SheetTitle>السلة</SheetTitle>
                <SheetCloseButton />
              </SheetHeader>
              <div className="overflow-y-auto p-4">{cartPanel}</div>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

function CartPanel(props: {
  cart: CartLine[];
  total: number;
  payment: SalePaymentMethod;
  setPayment: (p: SalePaymentMethod) => void;
  customerPhone: string;
  setCustomerPhone: (v: string) => void;
  customerName: string;
  setCustomerName: (v: string) => void;
  sellerName: string;
  setSellerName: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  setQty: (variantId: string, q: number) => void;
  remove: (variantId: string) => void;
  error: string | null;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const { cart, total } = props;
  return (
    <div className="flex flex-col gap-4" data-testid="cart-panel">
      <h2 className="text-base font-extrabold text-ink">السلة</h2>

      {cart.length === 0 ? (
        <p className="text-sm text-ink-soft">السلة فارغة. اضغط على صنف لإضافته.</p>
      ) : (
        <ul className="divide-y divide-[hsl(228_16%_90%)]">
          {cart.map((l) => (
            <li key={l.variantId} className="py-3" data-testid="cart-line">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 text-sm font-bold text-ink">{rowLabel(l)}</div>
                <button
                  type="button"
                  onClick={() => props.remove(l.variantId)}
                  aria-label={`حذف ${rowLabel(l)} من السلة`}
                  className="shrink-0 rounded-full p-1.5 text-ink-soft hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1" role="group" aria-label="الكمية">
                  <button
                    type="button"
                    onClick={() => props.setQty(l.variantId, l.quantity - 1)}
                    disabled={l.quantity <= 1}
                    aria-label="إنقاص الكمية"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-input hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span dir="ltr" className="w-10 text-center font-archivo text-sm font-bold" data-testid="cart-qty">
                    {l.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => props.setQty(l.variantId, l.quantity + 1)}
                    disabled={l.quantity >= l.sellable || l.quantity >= MAX_LINE_QTY}
                    aria-label="زيادة الكمية"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-input hover:bg-hover disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <div className="text-end text-xs text-ink-soft">
                  <bdi dir="ltr" className="font-archivo">{l.quantity} × {formatEgp(l.pricePiastres)}</bdi>
                  <div dir="ltr" className="font-archivo text-sm font-bold text-ink">
                    {formatEgp(l.quantity * l.pricePiastres)}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-[hsl(228_16%_86%)] pt-3">
        <span className="text-sm font-bold text-ink">الإجمالي</span>
        <span dir="ltr" className="font-archivo text-xl font-extrabold text-ink" data-testid="cart-total">
          {formatEgp(total)}
        </span>
      </div>

      <div>
        <div className="mb-1.5 text-sm font-medium text-ink" id="payment-label">طريقة الدفع</div>
        <div role="radiogroup" aria-labelledby="payment-label" className="grid grid-cols-3 gap-1 rounded-full bg-secondary p-1">
          {PAYMENT_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={props.payment === m}
              onClick={() => props.setPayment(m)}
              className={cn(
                "h-10 rounded-full text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                props.payment === m ? "bg-primary text-primary-foreground" : "text-ink hover:bg-hover"
              )}
            >
              {PAYMENT_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="space-y-1.5">
          <Label htmlFor="sale-customer-phone">هاتف العميل (اختياري)</Label>
          <Input
            id="sale-customer-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            className="text-start font-archivo"
            value={props.customerPhone}
            onChange={(e) => props.setCustomerPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sale-customer-name">اسم العميل (اختياري)</Label>
          <Input id="sale-customer-name" value={props.customerName} onChange={(e) => props.setCustomerName(e.target.value)} maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sale-seller-name">اسم البائع</Label>
          <Input id="sale-seller-name" value={props.sellerName} onChange={(e) => props.setSellerName(e.target.value)} maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sale-notes">ملاحظات</Label>
          <Textarea id="sale-notes" value={props.notes} onChange={(e) => props.setNotes(e.target.value)} maxLength={500} className="min-h-[64px]" />
        </div>
      </div>

      {props.error && (
        <p role="alert" className="rounded-xl bg-[hsl(0_84%_96%)] p-3 text-sm text-destructive" data-testid="sale-error">
          {props.error}
        </p>
      )}

      <Button type="button" size="lg" className="h-12 w-full" disabled={cart.length === 0 || props.submitting} onClick={props.onSubmit}>
        {props.submitting ? "جارٍ التسجيل..." : "تأكيد البيع"}
      </Button>
    </div>
  );
}
