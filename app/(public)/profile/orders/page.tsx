"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { getOrderStatusLabel, ORDER_STATUS_COLORS } from "@/lib/constants/order-status";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { formatDateEn } from "@/lib/format-en-numbers";
import { useCart } from "@/contexts/cart-context";
import { useToast } from "@/hooks/use-toast";
import { Package, ChevronDown, ChevronUp, RotateCcw, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderItem = {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPricePiastres: number;
  totalPiastres: number;
  variantId: string;
  imageUrl: string | null;
};

type ShippingAddress = {
  governorate?: string;
  city?: string;
  area?: string;
  street?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  notes?: string;
  phone?: string;
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
  createdAt: string;
  reservationExpiresAt: string | null;
  shippingAddress: ShippingAddress | null;
  cancellationReason: string | null;
  items: OrderItem[];
};

const PAGE_SIZE = 10;

function piastresToEgp(p: number) {
  return Math.round(p / 100);
}

function money(egp: number) {
  return `${egp.toLocaleString("en-US")} ج.م`;
}

function paymentLabel(method: string) {
  if (method === "COD") return "الدفع عند الاستلام";
  if (method === "INSTAPAY_PREPAID") return "الدفع عبر InstaPay";
  return "بطاقة";
}

// Internal actor tags stored in `cancellationReason` that should never be shown to a customer
// verbatim (see `lib/orders/partner-status-transition.ts` and the customer cancel route) — a
// free-text reason (set by an admin) is shown as-is; these codes are not.
const INTERNAL_CANCELLATION_TAGS = new Set(["customer", "partner_agent", "admin"]);

// ---------------------------------------------------------------------------
// Status pill — `.pill` (13px/500 text, 7px leading dot), one colour vocabulary
// (`ORDER_STATUS_COLORS`, lib/constants/order-status.ts).
// ---------------------------------------------------------------------------
function StatusPill({ status }: { status: string }) {
  const color = ORDER_STATUS_COLORS[status] ?? ORDER_STATUS_COLORS.CREATED;
  return (
    <span className="inline-flex items-center gap-[7px] text-[13px] font-medium" style={{ color }}>
      <i aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {getOrderStatusLabel(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 5-step stepper — `READY_TO_SHIP` sits on قيد التجهيز (index 2).
// ---------------------------------------------------------------------------
const STEP_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
const STEP_LABELS: Record<(typeof STEP_STATUSES)[number], string> = {
  CREATED: "تم الاستلام",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
};

function Stepper({ status }: { status: string }) {
  const idx = status === "READY_TO_SHIP" ? 2 : STEP_STATUSES.indexOf(status as (typeof STEP_STATUSES)[number]);
  return (
    <div className="flex items-center gap-0" role="list" aria-label="مراحل الطلب">
      {STEP_STATUSES.map((s, i) => {
        const done = idx >= 0 && i < idx;
        const now = i === idx;
        return (
          <div
            key={s}
            role="listitem"
            className="relative flex flex-1 flex-col items-center gap-2 text-[12px]"
            style={{ color: done || now ? "#151A35" : "#8A8C9A", fontWeight: now ? 500 : 400 }}
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-[4.5px] h-px w-1/2"
                style={{ insetInlineEnd: "50%", background: done ? "#B8902F" : "rgba(21,26,53,.16)" }}
              />
            )}
            {i < STEP_STATUSES.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-[4.5px] h-px w-1/2"
                style={{ insetInlineStart: "50%", background: i < idx ? "#B8902F" : "rgba(21,26,53,.16)" }}
              />
            )}
            <i
              aria-hidden="true"
              className="z-10 block h-2.5 w-2.5 rounded-full border-[1.5px]"
              style={{
                background: done ? "#B8902F" : now ? "#151A35" : "#FFFDFA",
                borderColor: done ? "#B8902F" : now ? "#151A35" : "rgba(21,26,53,.16)",
                boxShadow: now ? "0 0 0 4px rgba(184,144,47,.14)" : "none",
              }}
            />
            <span>{STEP_LABELS[s]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Thumbnails
// ---------------------------------------------------------------------------
function Thumb({ imageUrl, size = "md" }: { imageUrl: string | null; size?: "sm" | "md" }) {
  const dims = size === "sm" ? { w: 48, h: 60 } : { w: 64, h: 80 };
  return (
    <span
      className="flex flex-none items-end justify-center overflow-hidden bg-[#E7E2D8]"
      style={{ width: dims.w, height: dims.h }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt="" width={dims.w} height={dims.h} className="h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton (card shape, no text)
// ---------------------------------------------------------------------------
function OrderCardSkeleton() {
  return (
    <div className="flex flex-col gap-[18px] border border-[rgba(21,26,53,.16)] bg-[#FFFDFA] p-6">
      <div className="flex items-center justify-between">
        <span className="nk-shimmer h-4 w-[120px]" />
        <span className="nk-shimmer h-4 w-20" />
      </div>
      <span className="nk-shimmer h-[10px] w-full" />
      <div className="flex items-center gap-2">
        <span className="nk-shimmer h-20 w-16" />
        <span className="nk-shimmer h-20 w-16" />
        <span className="nk-shimmer h-4 flex-1 self-center" />
      </div>
    </div>
  );
}

function OrdersSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل الطلبات" className="mt-8 flex flex-col gap-4">
      <OrderCardSkeleton />
      <OrderCardSkeleton />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order card
// ---------------------------------------------------------------------------
function OrderCard({
  order,
  expanded,
  onToggleExpand,
  onReorder,
  onRequestCancel,
  reordering,
}: {
  order: Order;
  expanded: boolean;
  onToggleExpand: () => void;
  onReorder: () => void;
  onRequestCancel: () => void;
  reordering: boolean;
}) {
  const shown = order.items.slice(0, 3);
  const total = piastresToEgp(order.totalPiastres);
  const canReorder = order.status === "DELIVERED" || order.status === "CANCELLED";
  const canCancel = order.status === "CREATED";
  const addr = order.shippingAddress;
  const shippingLine =
    order.shippingPiastres + (order.paymentMethod === "COD" ? order.codFeePiastres : 0);
  const showReason =
    order.cancellationReason && !INTERNAL_CANCELLATION_TAGS.has(order.cancellationReason);

  return (
    <article className="flex flex-col gap-5 border border-[rgba(21,26,53,.16)] bg-[#FFFDFA] p-6 sm:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="font-archivo text-[15px] font-semibold tracking-[.02em]" style={{ direction: "ltr" }}>
            #{order.id.slice(-8).toUpperCase()}
          </span>
          <span className="text-[13px] text-[#8A8C9A]" style={{ direction: "ltr" }}>
            {formatDateEn(order.createdAt)}
          </span>
        </div>
        <StatusPill status={order.status} />
      </header>

      {order.status === "CANCELLED" ? (
        <p
          className="m-0 border-s-2 px-3.5 py-2.5 text-[13.5px]"
          style={{ borderInlineStartColor: "#A83A2A", background: "rgba(168,58,42,.10)", color: "rgba(21,26,53,.6)" }}
        >
          أُلغي هذا الطلب بناءً على طلبك. لم يُخصم أي مبلغ.
          {showReason ? ` السبب: ${order.cancellationReason}` : ""}
        </p>
      ) : (
        <Stepper status={order.status} />
      )}

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {shown.map((item) => (
            <Thumb key={item.id} imageUrl={item.imageUrl} />
          ))}
          {order.items.length > 3 && (
            <span className="flex h-20 w-16 flex-none items-center justify-center bg-[#E7E2D8] text-[12px] text-[#8A8C9A]">
              +{order.items.length - 3}
            </span>
          )}
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-0.5 text-[13.5px]">
          {shown.map((item) => (
            <span key={item.id}>
              <span className="text-[#151A35]">{item.productName}</span>{" "}
              <span className="text-[#8A8C9A]">
                — {item.variantName} × <span className="font-archivo">{item.quantity.toLocaleString("en-US")}</span>
              </span>
            </span>
          ))}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-amiri text-[26px] font-bold" style={{ direction: "ltr" }}>
            <span className="font-archivo">{total.toLocaleString("en-US")}</span> ج.م
          </span>
          <span className="text-[12.5px] text-[#8A8C9A]">{paymentLabel(order.paymentMethod)}</span>
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(21,26,53,.09)] pt-3.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="inline-flex items-center gap-1.5 border-b border-[#B8902F] text-[13.5px] text-[#151A35]"
        >
          {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <div className="flex flex-wrap gap-2">
          {canReorder && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-none border-[rgba(21,26,53,.16)] text-[13px]"
              onClick={onReorder}
              disabled={reordering}
            >
              <RotateCcw className="h-4 w-4" />
              {reordering ? "جارٍ الإعادة…" : "إعادة الطلب"}
            </Button>
          )}
          {canCancel && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-none border-[#A83A2A] text-[13px] text-[#A83A2A] hover:bg-[rgba(168,58,42,.08)]"
              onClick={onRequestCancel}
            >
              إلغاء الطلب
            </Button>
          )}
          {/* Slot for backlog 6.5a's order-ticket button ("سؤال عن الطلب") — renders nothing
              until that task ships the customer ticket flow. */}
        </div>
      </footer>

      {expanded && (
        <div className="grid grid-cols-1 gap-7 border-t border-[rgba(21,26,53,.09)] pt-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-3.5">
            <p className="m-0 text-[12px] tracking-[.06em] text-[#8A8C9A]">الأصناف</p>
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3.5">
                <Thumb imageUrl={item.imageUrl} size="sm" />
                <span className="flex flex-1 flex-col">
                  <span className="text-[14px]">{item.productName}</span>
                  <span className="text-[12.5px] text-[#8A8C9A]">
                    {item.variantName} × <span className="font-archivo">{item.quantity.toLocaleString("en-US")}</span>
                  </span>
                </span>
                <span className="text-[14px]" style={{ direction: "ltr" }}>
                  {money(piastresToEgp(item.totalPiastres))}
                </span>
              </div>
            ))}
            <p className="m-0 mt-2.5 text-[12px] tracking-[.06em] text-[#8A8C9A]">عنوان التوصيل</p>
            {addr ? (
              <p className="m-0 text-[14px]">
                {[addr.governorate, addr.city, addr.area, addr.street].filter(Boolean).join("، ")}
                <br />
                <span className="font-archivo text-[13px] text-[#8A8C9A]" style={{ direction: "ltr" }}>
                  {addr.phone}
                </span>
              </p>
            ) : (
              <p className="m-0 text-[14px] text-[#8A8C9A]">لا يوجد عنوان محفوظ لهذا الطلب.</p>
            )}
          </div>
          <div className="self-start bg-[#F7F4EE] px-5 py-4.5">
            <div className="flex justify-between gap-3 py-1.5 text-[14px]">
              <span className="text-[#8A8C9A]">المجموع الفرعي</span>
              <b className="font-medium" style={{ direction: "ltr" }}>
                {money(piastresToEgp(order.subtotalPiastres))}
              </b>
            </div>
            {order.discountPiastres > 0 && (
              <div className="flex justify-between gap-3 py-1.5 text-[14px]">
                <span className="text-[#8A8C9A]">الخصم</span>
                <b className="font-medium" style={{ color: "#2F6B4C", direction: "ltr" }}>
                  − {money(piastresToEgp(order.discountPiastres))}
                </b>
              </div>
            )}
            <div className="flex justify-between gap-3 py-1.5 text-[14px]">
              <span className="text-[#8A8C9A]">رسوم الشحن</span>
              <b className="font-medium" style={{ direction: "ltr" }}>
                {shippingLine > 0 ? money(piastresToEgp(shippingLine)) : "مجانًا"}
              </b>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-[rgba(21,26,53,.16)] pt-3">
              <span className="text-[14px]">الإجمالي</span>
              <b className="font-amiri text-[22px] font-bold" style={{ direction: "ltr" }}>
                <span className="font-archivo">{total.toLocaleString("en-US")}</span> ج.م
              </b>
            </div>
            <p className="mt-2.5 mb-0 text-[12px] text-[#8A8C9A]">{paymentLabel(order.paymentMethod)}</p>
          </div>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Filters / search
// ---------------------------------------------------------------------------
const ONGOING_STATUSES = new Set(["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED"]);

type FilterKey = "all" | "ongoing" | "delivered" | "cancelled";

function filterOrder(order: Order, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "ongoing") return ONGOING_STATUSES.has(order.status);
  if (filter === "delivered") return order.status === "DELIVERED";
  return order.status === "CANCELLED";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function ProfileOrdersPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { refreshCart, openDrawer } = useCart();

  const [orders, setOrders] = React.useState<Order[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [search, setSearch] = React.useState("");
  const [reorderingId, setReorderingId] = React.useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = React.useState<Order | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  const loadFirstPage = React.useCallback(() => {
    setLoading(true);
    setHasError(false);
    fetch(`/api/profile/orders?take=${PAGE_SIZE}`, { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/orders");
          return null;
        }
        if (!res.ok) {
          setHasError(true);
          return null;
        }
        return parseJsonResponse<{ success?: boolean; data?: { orders: Order[]; nextCursor: string | null } }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          setOrders(json.data.orders);
          setNextCursor(json.data.nextCursor);
        } else if (json != null) {
          setHasError(true);
        }
      })
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, [router]);

  React.useEffect(() => loadFirstPage(), [loadFirstPage]);

  const loadOlder = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/profile/orders?cursor=${nextCursor}&take=${PAGE_SIZE}`, {
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace("/login?redirect=/profile/orders");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; data?: { orders: Order[]; nextCursor: string | null } }>(
        res
      );
      if (json?.success && json.data) {
        setOrders((prev) => [...prev, ...json.data!.orders]);
        setNextCursor(json.data.nextCursor);
      } else {
        toast({ title: "تعذر تحميل مزيد من الطلبات", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذر تحميل مزيد من الطلبات", variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reorder = async (order: Order) => {
    setReorderingId(order.id);
    try {
      for (const item of order.items) {
        const res = await fetch("/api/cart/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ variantId: item.variantId, quantity: item.quantity }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          const serverMessage: string = json?.error?.message ?? "حدث خطأ";
          toast({
            title: `${item.productName} — ${item.variantName}: ${serverMessage}`,
            variant: "destructive",
          });
          break;
        }
      }
    } finally {
      await refreshCart();
      openDrawer();
      setReorderingId(null);
    }
  };

  const confirmCancel = async () => {
    const target = cancelTarget;
    if (!target) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/profile/orders/${target.id}/cancel`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.status === 401) {
        router.replace("/login?redirect=/profile/orders");
        return;
      }
      const json = await parseJsonResponse<{ success?: boolean; error?: { message?: string } }>(res);
      if (json?.success) {
        setOrders((prev) => prev.map((o) => (o.id === target.id ? { ...o, status: "CANCELLED" } : o)));
        toast({ title: "تم إلغاء الطلب" });
      } else {
        toast({ title: json?.error?.message ?? "تعذّر إلغاء الطلب", variant: "destructive" });
        if (res.status === 409) loadFirstPage();
      }
    } catch {
      toast({ title: "تعذّر إلغاء الطلب", variant: "destructive" });
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
  };

  const counts = React.useMemo(() => {
    return {
      all: orders.length,
      ongoing: orders.filter((o) => ONGOING_STATUSES.has(o.status)).length,
      delivered: orders.filter((o) => o.status === "DELIVERED").length,
      cancelled: orders.filter((o) => o.status === "CANCELLED").length,
    };
  }, [orders]);

  const visibleOrders = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (!filterOrder(o, filter)) return false;
      if (!q) return true;
      const idMatch = o.id.slice(-8).toLowerCase().includes(q);
      const itemMatch = o.items.some((i) => i.productName.toLowerCase().includes(q));
      return idMatch || itemMatch;
    });
  }, [orders, filter, search]);

  if (loading) {
    return (
      <div>
        <SectionHeader />
        <OrdersSkeleton />
      </div>
    );
  }

  if (hasError) {
    return (
      <div>
        <SectionHeader />
        <div
          role="alert"
          className="mt-8 flex flex-wrap items-center justify-between gap-4 border p-[18px_22px]"
          style={{ borderColor: "#A83A2A", background: "rgba(168,58,42,.10)" }}
        >
          <span className="flex items-center gap-3 text-[14.5px]" style={{ color: "#A83A2A" }}>
            <AlertTriangle className="h-5 w-5" strokeWidth={1.3} />
            تعذر تحميل طلباتك الآن. لم نفقد شيئًا — حاول مرة أخرى.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 rounded-none text-[13px]"
            style={{ borderColor: "#A83A2A", color: "#A83A2A" }}
            onClick={loadFirstPage}
          >
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader />

      {orders.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 border border-[rgba(21,26,53,.16)] bg-[#FFFDFA] p-14 text-center">
          <span style={{ color: "#B8902F" }}>
            <Package className="h-10 w-10" strokeWidth={1.3} />
          </span>
          <h2 className="font-amiri text-2xl font-bold text-[#151A35]">لا توجد طلبات حتى الآن.</h2>
          <p className="m-0 max-w-xs text-[14px] text-[#8A8C9A]">
            أول طلب لك يظهر هنا مع تتبّع حالته خطوة بخطوة.
          </p>
          <Button asChild className="mt-2 h-12 rounded-none bg-[#151A35] text-papyrus hover:bg-[#1f2749]">
            <Link href="/categories">تسوق الآن</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "الكل"],
                  ["ongoing", "جارية"],
                  ["delivered", "تم التسليم"],
                  ["cancelled", "ملغية"],
                ] as [FilterKey, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className="relative flex h-9 items-center border px-4 text-[13.5px]"
                  style={{
                    borderColor: filter === key ? "#151A35" : "rgba(21,26,53,.16)",
                    color: filter === key ? "#151A35" : "rgba(21,26,53,.8)",
                    fontWeight: filter === key ? 500 : 400,
                  }}
                >
                  {label}
                  {(key === "all" || key === "ongoing") && (
                    <span className="ms-1.5 font-archivo text-[#8A8C9A]">
                      {counts[key].toLocaleString("en-US")}
                    </span>
                  )}
                  {filter === key && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-[3px] h-px"
                      style={{ insetInline: 12, background: "#B8902F" }}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="flex h-9 min-w-[220px] items-center gap-2 border border-[rgba(21,26,53,.16)] px-3 text-[13px] text-[#8A8C9A] focus-within:border-[#B8902F]">
              <label htmlFor="orders-search" className="sr-only">
                ابحث برقم الطلب أو المنتج
              </label>
              <input
                id="orders-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث برقم الطلب أو المنتج…"
                className="h-full flex-1 bg-transparent outline-none placeholder:text-[#8A8C9A]"
              />
            </div>
          </div>

          {visibleOrders.length === 0 ? (
            <p className="mt-8 text-center text-[14px] text-[#8A8C9A]">لا توجد طلبات مطابقة.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  expanded={expandedIds.has(order.id)}
                  onToggleExpand={() => toggleExpand(order.id)}
                  onReorder={() => reorder(order)}
                  onRequestCancel={() => setCancelTarget(order)}
                  reordering={reorderingId === order.id}
                />
              ))}
            </div>
          )}

          {nextCursor && (
            <div className="mt-7 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-none border-[rgba(21,26,53,.16)] text-[13px]"
                onClick={loadOlder}
                disabled={loadingMore}
              >
                {loadingMore ? "جارٍ التحميل…" : "عرض طلبات أقدم"}
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={cancelTarget != null} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="rounded-none border border-[rgba(21,26,53,.16)] bg-papyrus">
          <DialogHeader>
            <DialogTitle className="font-amiri text-xl font-bold text-[#151A35]">
              إلغاء الطلب #{cancelTarget?.id.slice(-8).toUpperCase()}؟
            </DialogTitle>
            <DialogDescription className="text-[#8A8C9A]">
              لا يمكن التراجع عن هذا الإجراء بعد التأكيد.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="h-11 rounded-none border-[#151A35] text-[#151A35]"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
            >
              تراجع
            </Button>
            <Button
              className="h-11 rounded-none bg-[#A83A2A] text-white hover:bg-[#8f3123]"
              onClick={confirmCancel}
              disabled={cancelling}
            >
              {cancelling ? "جارٍ الإلغاء…" : "إلغاء الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-amiri text-[26px] font-bold text-[#151A35]">طلباتي</h2>
        <p className="mt-1 text-[13.5px] text-[#8A8C9A]">تتبّع طلباتك الجارية وراجع ما سبق.</p>
      </div>
    </div>
  );
}
