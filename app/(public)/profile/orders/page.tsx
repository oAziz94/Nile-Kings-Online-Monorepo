"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Price } from "@/components/shared/price";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { getOrderStatusLabel } from "@/lib/constants/order-status";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { formatDateEn } from "@/lib/format-en-numbers";
import { PackageSearch } from "lucide-react";

type OrderItem = {
  id: string;
  productName: string;
  variantName: string;
  quantity: number;
  unitPricePiastres: number;
  totalPiastres: number;
};

type Order = {
  id: string;
  status: string;
  totalPiastres: number;
  shippingProvider: string;
  paymentMethod: string;
  createdAt: string;
  reservationExpiresAt: string | null;
  items: OrderItem[];
};

function piastresToEgp(p: number) {
  return Math.round(p / 100);
}

// Small dot colour per status — keyed by the same `ORDER_STATUSES` this app defines
// (lib/constants/order-status.ts). `READY_TO_SHIP` was missing here before this task.
const statusDotClass: Record<string, string> = {
  CREATED: "bg-[hsl(228_18%_60%)]",
  CONFIRMED: "bg-[hsl(200_60%_45%)]",
  PROCESSING: "bg-gold-500",
  READY_TO_SHIP: "bg-[hsl(265_45%_50%)]",
  SHIPPED: "bg-[hsl(265_45%_50%)]",
  DELIVERED: "bg-[hsl(150_36%_36%)]",
  CANCELLED: "bg-[hsl(6_58%_42%)]",
};

function OrdersSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل الطلبات" className="mt-8 flex flex-col gap-0 border-t border-[hsl(228_16%_84%)]">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 border-b border-[hsl(228_16%_84%)] py-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export default function ProfileOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hasError, setHasError] = React.useState(false);

  const load = React.useCallback(() => {
    setLoading(true);
    setHasError(false);
    fetch("/api/profile/orders", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) {
          router.replace("/login?redirect=/profile/orders");
          return null;
        }
        if (!res.ok) {
          setHasError(true);
          return null;
        }
        return parseJsonResponse<{ success?: boolean; data?: Order[] }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) {
          setOrders(json.data);
        } else if (json != null) {
          setHasError(true);
        }
      })
      .catch(() => setHasError(true))
      .finally(() => setLoading(false));
  }, [router]);

  React.useEffect(() => load(), [load]);

  if (loading) {
    return (
      <div>
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">طلباتي</h2>
        <OrdersSkeleton />
      </div>
    );
  }

  if (hasError) {
    return (
      <div>
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">طلباتي</h2>
        <div
          role="alert"
          className="mt-8 flex flex-col items-center gap-4 border border-[hsl(228_16%_84%)] bg-[hsl(38_22%_95%)] p-10 text-center"
        >
          <p className="text-[hsl(228_18%_40%)]">تعذّر تحميل الطلبات. تحقق من اتصالك وحاول مرة أخرى.</p>
          <Button variant="outline" className="rounded-none" onClick={load}>
            إعادة المحاولة
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">طلباتي</h2>

      {orders.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<PackageSearch className="h-8 w-8" strokeWidth={1.3} />}
          title="لا توجد طلبات حتى الآن."
          action={
            <Button asChild className="h-14 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]">
              <Link href="/categories">تسوق الآن</Link>
            </Button>
          }
        />
      ) : (
        <ul className="mt-8 list-none border-t border-[hsl(228_16%_84%)] p-0">
          {orders.map((order) => (
            <li key={order.id} className="border-b border-[hsl(228_16%_84%)] py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-archivo text-sm text-[hsl(228_18%_45%)]" style={{ direction: "ltr" }}>
                    #{order.id.slice(-8).toUpperCase()}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-plex-arabic text-sm text-[hsl(228_40%_14%)]">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 rounded-full ${statusDotClass[order.status] ?? "bg-[hsl(228_18%_60%)]"}`}
                    />
                    {getOrderStatusLabel(order.status)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-archivo text-[hsl(228_18%_45%)]" style={{ direction: "ltr" }}>
                    {formatDateEn(order.createdAt)}
                  </span>
                  <Price amount={piastresToEgp(order.totalPiastres)} size="md" />
                </div>
              </div>
              <ul className="mt-4 list-none space-y-2 p-0 text-sm">
                {order.items.slice(0, 3).map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 text-[hsl(228_18%_45%)]">
                    <span className="min-w-0 truncate">
                      {item.productName} — {item.variantName} × {item.quantity.toLocaleString("en-US")}
                    </span>
                    <span className="shrink-0 font-archivo" style={{ direction: "ltr" }}>
                      {piastresToEgp(item.totalPiastres).toLocaleString("en-US")} ج.م
                    </span>
                  </li>
                ))}
              </ul>
              {order.items.length > 3 && (
                <p className="mt-2 text-xs text-[hsl(228_18%_45%)]">
                  +{(order.items.length - 3).toLocaleString("en-US")} صنف آخر
                </p>
              )}
              <p className="mt-3 text-xs text-[hsl(228_18%_45%)]">
                {order.paymentMethod === "COD"
                  ? "الدفع عند الاستلام"
                  : order.paymentMethod === "INSTAPAY_PREPAID"
                    ? "الدفع عبر InstaPay"
                    : "بطاقة"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
