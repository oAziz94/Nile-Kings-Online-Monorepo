"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Banknote,
  CheckCircle2,
  Folder,
  Package,
  Settings,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { AdminKpiCard } from "@/components/admin/admin-kpi-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusBadge } from "@/components/admin/admin-page-header";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

type Kpis = {
  totalRevenuePiastres: number;
  netMerchandisePiastres: number;
  orderCount: number;
};

const QUICK_LINKS = [
  { href: "/admin/analytics", label: "التقارير", icon: BarChart3, desc: "إيرادات ومبيعات مُسلَّمة" },
  { href: "/admin/orders", label: "الطلبات", icon: ShoppingBag, desc: "متابعة وتحديث الحالة" },
  { href: "/admin/products", label: "المنتجات", icon: Package, desc: "الكتالوج والمتغيرات" },
  { href: "/admin/clients", label: "العملاء", icon: Users, desc: "حسابات المتجر" },
  { href: "/admin/categories", label: "الفئات", icon: Folder, desc: "تنظيم المنتجات" },
  { href: "/admin/settings", label: "الإعدادات", icon: Settings, desc: "COD و OTP وغيرها" },
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
    <div className="space-y-8">
      <AdminPageHeader
        title="لوحة التحكم"
        description="نظرة سريعة على أداء المتجر. الأرقام أدناه للطلبات المُسلَّمة (تم التسليم)."
        badge={
          <AdminStatusBadge>
            <CheckCircle2 className="h-3 w-3" />
            تم التسليم
          </AdminStatusBadge>
        }
        actions={
          <Link
            href="/admin/analytics"
            className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
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

      <div>
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground">اختصارات</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map(({ href, label, icon: Icon, desc }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-start gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-subtle",
                "transition-all hover:border-burgundy/25 hover:shadow-card"
              )}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-burgundy/10 text-burgundy ring-1 ring-inset ring-burgundy/15 transition-colors group-hover:bg-burgundy/15">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
