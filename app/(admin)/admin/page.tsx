"use client";

import { useEffect, useState } from "react";
import { piastresToEgp } from "@/lib/catalog";

type Kpis = {
  totalRevenuePiastres: number;
  orderCount: number;
  productCount: number;
  customerCount: number;
};

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics?section=kpis", { credentials: "include" })
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: Kpis }) => {
        if (json?.success && json.data) setKpis(json.data);
      })
      .catch(() => setKpis(null))
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      label: "إجمالي المبيعات",
      value: kpis
        ? `${piastresToEgp(kpis.totalRevenuePiastres).toLocaleString("ar-EG")} ج.م`
        : loading
          ? "…"
          : "—",
    },
    {
      label: "الطلبات",
      value: kpis != null ? kpis.orderCount.toLocaleString("ar-EG") : loading ? "…" : "—",
    },
    {
      label: "المنتجات",
      value: kpis != null ? kpis.productCount.toLocaleString("ar-EG") : loading ? "…" : "—",
    },
    {
      label: "العملاء",
      value: kpis != null ? kpis.customerCount.toLocaleString("ar-EG") : loading ? "…" : "—",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
      <p className="mt-2 text-muted-foreground">
        مرحباً، هذه لوحة إدارة نايل كينجز.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-border bg-card p-6 shadow-subtle"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
