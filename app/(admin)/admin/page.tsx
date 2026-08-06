"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Plus,
  Package,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { AdminKpiCard } from "@/components/admin/admin-kpi-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-page-header";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";

type Kpis = {
  totalRevenuePiastres: number;
  netMerchandisePiastres: number;
  orderCount: number;
};

const QUICK_LINKS = [
  { href: "/admin/orders", label: "مراجعة الطلبات", icon: ClipboardList },
  { href: "/admin/orders/new", label: "طلب جديد", icon: Plus },
  { href: "/admin/products/new", label: "منتج جديد", icon: Package },
  { href: "/admin/partner-inventory", label: "مخزون الشركاء", icon: Boxes },
] as const;

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      section: "kpis",
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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="لوحة التحكم"
        description="ملخص سريع للطلبات المُسلَّمة وإجراءات الإدارة اليومية."
        badge={
          <AdminStatusBadge>
            <CheckCircle2 className="h-3 w-3" />
            تم التسليم
          </AdminStatusBadge>
        }
        actions={
          <Link
            href="/admin/analytics"
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 hover:text-primary-foreground"
          >
            التقارير التفصيلية
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdminKpiCard
          title="إجمالي الإيراد"
          value={
            kpis
              ? `${formatNumberEn(piastresToEgp(kpis.totalRevenuePiastres))} ج.م`
              : "—"
          }
          hint="محصل من طلبات مُسلَّمة"
          icon={<TrendingUp className="h-6 w-6" />}
          accent="burgundy"
          loading={loading}
        />
        <AdminKpiCard
          title="صافي المنتجات"
          value={
            kpis
              ? `${formatNumberEn(piastresToEgp(kpis.netMerchandisePiastres))} ج.م`
              : "—"
          }
          hint="بدون شحن ورسوم COD"
          icon={<Banknote className="h-6 w-6" />}
          accent="gold"
          loading={loading}
        />
        <AdminKpiCard
          title="طلبات مُسلَّمة"
          value={kpis != null ? formatNumberEn(kpis.orderCount) : "—"}
          icon={<ShoppingBag className="h-6 w-6" />}
          accent="emerald"
          loading={loading}
        />
      </div>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-foreground">إجراءات سريعة</h2>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 bg-card p-4 text-sm font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
