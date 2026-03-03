"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Price } from "@/components/shared/price";
import { Button } from "@/components/ui/button";
import { getOrderStatusLabel } from "@/lib/constants/order-status";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { cn } from "@/lib/utils";

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

const statusColors: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CREATED: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  PROCESSING: "bg-sky-100 text-sky-800",
  SHIPPED: "bg-violet-100 text-violet-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-neutral-100 text-neutral-600",
};

export default function ProfileOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/profile/orders", { credentials: "include" })
      .then(async (res) => {
        if (res.status === 401) window.location.href = "/login?redirect=/profile/orders";
        return parseJsonResponse<{ success?: boolean; data?: Order[] }>(res);
      })
      .then((json) => {
        if (json?.success && json.data) setOrders(json.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-foreground">طلباتي</h1>
        <p className="mt-2 text-muted-foreground">جاري التحميل…</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">طلباتي</h1>
      <p className="mt-1 text-sm text-muted-foreground">عرض حالة الطلبات وتفاصيلها</p>

      {orders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">لا توجد طلبات حتى الآن.</p>
          <Button asChild className="mt-4 rounded-2xl">
            <Link href="/categories">تسوق الآن</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((order) => (
            <li
              key={order.id}
              className="rounded-2xl border border-border bg-card overflow-hidden"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3 sm:px-6">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">
                    #{order.id.slice(-8).toUpperCase()}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium",
                      statusColors[order.status] ?? "bg-muted text-muted-foreground"
                    )}
                  >
                    {getOrderStatusLabel(order.status)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {new Date(order.createdAt).toLocaleDateString("ar-EG", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <Price amount={piastresToEgp(order.totalPiastres)} size="md" />
                </div>
              </div>
              <div className="px-4 py-3 sm:px-6">
                <ul className="space-y-2 text-sm">
                  {order.items.slice(0, 3).map((item) => (
                    <li key={item.id} className="flex justify-between text-muted-foreground">
                      <span>
                        {item.productName} — {item.variantName} × {item.quantity}
                      </span>
                      <span>{piastresToEgp(item.totalPiastres).toLocaleString("ar-EG")} ج.م</span>
                    </li>
                  ))}
                </ul>
                {order.items.length > 3 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    +{order.items.length - 3} صنف آخر
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {order.shippingProvider} · {order.paymentMethod === "COD" ? "الدفع عند الاستلام" : "بطاقة"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
