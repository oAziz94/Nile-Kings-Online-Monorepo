"use client";

import { useEffect, useState } from "react";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";

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
    const params = new URLSearchParams({
      section: "kpis",
      // Dashboard KPIs should represent all-time totals, not default 30-day window.
      from: "1970-01-01",
    });
    fetch(`/api/admin/analytics?${params.toString()}`, { credentials: "include" })
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
        ? `${formatNumberEn(piastresToEgp(kpis.totalRevenuePiastres))} ج.م`
        : loading
          ? "…"
          : "—",
    },
    {
      label: "الطلبات",
      value: kpis != null ? formatNumberEn(kpis.orderCount) : loading ? "…" : "—",
    },
    {
      label: "المنتجات",
      value: kpis != null ? formatNumberEn(kpis.productCount) : loading ? "…" : "—",
    },
    {
      label: "العملاء",
      value: kpis != null ? formatNumberEn(kpis.customerCount) : loading ? "…" : "—",
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
